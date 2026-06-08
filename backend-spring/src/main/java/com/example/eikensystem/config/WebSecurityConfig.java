package com.example.eikensystem.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import com.example.eikensystem.security.JwtAuthFilter;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;
import org.springframework.web.filter.CorsFilter;

import java.util.List;

@Configuration
@EnableMethodSecurity(prePostEnabled = true)
public class WebSecurityConfig {

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http, JwtAuthFilter jwtAuthFilter) throws Exception {
        http
                .csrf(csrf -> csrf.disable())
                .cors(cors -> {})
                .sessionManagement(sm -> sm.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers("/health", "/api/auth/**").permitAll()
                        // Data Admin endpoints are restricted to DATA_ADMIN role only
                        .requestMatchers("/api/admin/**").hasRole("DATA_ADMIN")
                        // Reports: viewable by LEADER and QA
                        .requestMatchers("/api/reports/**").hasAnyRole("LEADER", "QA", "ADMIN")
                        // Approvals: view + actions require auth; actions are further restricted via @PreAuthorize
                        .requestMatchers("/api/approvals/**").authenticated()
                        // Measurements: operator/qa/leader/admin can use
                        .requestMatchers("/api/measurements/**").hasAnyRole("OPERATOR", "LEADER", "QA", "ADMIN")
                        // Products/Scales read: require auth as well (frontend calls after login)
                        .requestMatchers(HttpMethod.GET, "/api/products/**", "/api/scales/**").authenticated()
                        .anyRequest().authenticated()
                );
        http.addFilterBefore(jwtAuthFilter, UsernamePasswordAuthenticationFilter.class);
        // CSP on API responses: connect-src allows KiosBioAgent (https://localhost:5001 on OPERATOR PC).
        // 'unsafe-eval' / 'unsafe-inline' only affects scripts loaded from Spring Boot responses (none in prod).
        http.headers(headers -> headers.contentSecurityPolicy(csp -> csp.policyDirectives(
            "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline'; connect-src 'self' https://localhost:5001;")
        ));
        return http.build();
    }

    @Bean
    public CorsFilter corsFilter() {
        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        CorsConfiguration config = new CorsConfiguration();
        config.setAllowCredentials(true);
        // เพิ่ม origin ของ Tablet ตรงนี้เมื่อ Deploy จริง เช่น "http://10.1.53.32:5173"
        config.setAllowedOriginPatterns(List.of("*"));
        config.setAllowedHeaders(List.of("*"));
        config.setAllowedMethods(List.of("GET","POST","PUT","DELETE","OPTIONS"));
        source.registerCorsConfiguration("/**", config);
        return new CorsFilter(source);
    }

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

}
