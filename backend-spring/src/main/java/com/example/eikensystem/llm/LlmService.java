package com.example.eikensystem.llm;

import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.Set;

@Service
@RequiredArgsConstructor
public class LlmService {
    @Value("${llm.enabled:false}")
    private boolean enabled;
    @Value("${llm.model:claude-3-5-sonnet-20241022}")
    private String model;
    @Value("${llm.maxTokensDefault:512}")
    private int maxTokensDefault;
    @Value("${llm.allowedRoles:QA,LEADER}")
    private String allowedRolesRaw;

    private ClaudeClient client;

    private synchronized void ensureClient() {
        if (client == null) {
            String apiKey = System.getenv("CLAUDE_API_KEY");
            if (apiKey == null || apiKey.isBlank()) {
                throw new IllegalStateException("CLAUDE_API_KEY env var not set");
            }
            client = new ClaudeClient(apiKey, model);
        }
    }

    public ChatResult chat(String prompt, Integer maxTokens, String userRole) {
        if (!enabled) {
            return ChatResult.disabled("LLM feature disabled");
        }
        Set<String> allowed = Set.of(allowedRolesRaw.split(","));
        if (userRole == null || !allowed.contains(userRole.toUpperCase())) {
            return ChatResult.denied("Role not allowed: " + userRole);
        }
        int useTokens = (maxTokens != null && maxTokens > 0) ? Math.min(maxTokens, maxTokensDefault) : maxTokensDefault;
        // Basic prompt guardrail (Thai + English)
        String systemHeader = """
                คุณคือผู้ช่วยวิเคราะห์ข้อมูลการชั่งน้ำหนัก ช่วยตอบให้กระชับ ไม่เปิดเผยข้อมูลอ่อนไหว หรือรหัสผ่าน.
                You are an assistant for weight/QA workflow. Be concise, avoid sensitive data.""";
        String effectivePrompt = systemHeader + "\n\n" + prompt;
        try {
            ensureClient();
            ClaudeClient.ClaudeResponse resp = client.chat(effectivePrompt, useTokens);
            return ChatResult.success(resp.completion(), resp.inputTokens(), resp.outputTokens(), resp.latencyMs(), useTokens);
        } catch (Exception ex) {
            return ChatResult.error("LLM call failed: " + ex.getMessage());
        }
    }

    public static record ChatResult(boolean ok, String status, String message, String completion,
                                    Integer inputTokens, Integer outputTokens, Long latencyMs, Integer maxTokensUsed, Instant ts) {
        public static ChatResult success(String completion, int inTok, int outTok, long latency, int maxUsed) {
            return new ChatResult(true, "OK", null, completion, inTok, outTok, latency, maxUsed, Instant.now());
        }
        public static ChatResult error(String msg) {
            return new ChatResult(false, "ERROR", msg, null, null, null, null, null, Instant.now());
        }
        public static ChatResult disabled(String msg) {
            return new ChatResult(false, "DISABLED", msg, null, null, null, null, null, Instant.now());
        }
        public static ChatResult denied(String msg) {
            return new ChatResult(false, "DENIED", msg, null, null, null, null, null, Instant.now());
        }
    }
}
