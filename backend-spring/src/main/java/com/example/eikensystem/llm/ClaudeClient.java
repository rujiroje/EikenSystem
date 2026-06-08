package com.example.eikensystem.llm;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;

/** Lightweight client for Anthropic Claude API (messages endpoint). */
public class ClaudeClient {
    private final String apiKey;
    private final String model;
    private final HttpClient http;
    private final ObjectMapper om = new ObjectMapper();

    public ClaudeClient(String apiKey, String model) {
        this.apiKey = apiKey;
        this.model = model;
        this.http = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(5))
                .build();
    }

    public ClaudeResponse chat(String prompt, int maxTokens) throws IOException, InterruptedException {
        if (prompt == null || prompt.isBlank()) {
            throw new IllegalArgumentException("Prompt must not be blank");
        }
        int safeMax = Math.max(1, maxTokens);
        String body = "{" +
                "\"model\":\"" + model + "\"," +
                "\"max_tokens\":" + safeMax + "," +
                "\"messages\":[{\"role\":\"user\",\"content\":\"" + escape(prompt) + "\"}]" +
                "}";
        HttpRequest req = HttpRequest.newBuilder(URI.create("https://api.anthropic.com/v1/messages"))
                .header("Content-Type", "application/json")
                .header("x-api-key", apiKey)
                .header("anthropic-version", "2023-06-01")
                .timeout(Duration.ofSeconds(40))
                .POST(HttpRequest.BodyPublishers.ofString(body))
                .build();
        long start = System.nanoTime();
        HttpResponse<String> resp = http.send(req, HttpResponse.BodyHandlers.ofString());
        long elapsedMs = (System.nanoTime() - start) / 1_000_000L;
        if (resp.statusCode() >= 400) {
            throw new IOException("Claude error " + resp.statusCode() + ": " + resp.body());
        }
        JsonNode root = om.readTree(resp.body());
        String completion = extractText(root);
        int inputTokens = root.path("usage").path("input_tokens").asInt(0);
        int outputTokens = root.path("usage").path("output_tokens").asInt(0);
        return new ClaudeResponse(completion, inputTokens, outputTokens, elapsedMs);
    }

    private String extractText(JsonNode root) {
        // Response format may include content array items with type=text
        JsonNode contentArr = root.path("content");
        if (contentArr.isArray() && contentArr.size() > 0) {
            JsonNode first = contentArr.get(0);
            JsonNode textNode = first.path("text");
            if (!textNode.isMissingNode()) {
                return textNode.asText("");
            }
        }
        // Fallback
        return root.path("completion").asText("");
    }

    private String escape(String s) {
        return s.replace("\\", "\\\\").replace("\"", "\\\"");
    }

    public static record ClaudeResponse(String completion, int inputTokens, int outputTokens, long latencyMs) {}
}
