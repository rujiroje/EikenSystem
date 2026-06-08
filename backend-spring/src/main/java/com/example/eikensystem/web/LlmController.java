package com.example.eikensystem.web;

import com.example.eikensystem.llm.LlmService;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/llm")
@RequiredArgsConstructor
public class LlmController {
    private final LlmService llmService;

    @PostMapping("/chat")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<?> chat(@RequestBody ChatRequest req, Authentication auth) {
        String role = extractPrimaryRole(auth);
        LlmService.ChatResult result = llmService.chat(req.getPrompt(), req.getMaxTokens(), role);
        return ResponseEntity.ok(result);
    }

    private String extractPrimaryRole(Authentication auth) {
        if (auth == null) return null;
        // Return first ROLE_XXX authority without prefix
        return auth.getAuthorities().stream()
                .map(a -> a.getAuthority())
                .filter(s -> s.startsWith("ROLE_"))
                .map(s -> s.substring(5))
                .findFirst().orElse(null);
    }

    @Data
    public static class ChatRequest {
        private String prompt;
        private Integer maxTokens; // optional
    }
}
