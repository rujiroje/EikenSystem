package com.example.eikensystem.security;

import com.example.eikensystem.domain.AppUser;
import com.example.eikensystem.domain.Role;
import com.example.eikensystem.repo.UserRepo;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.lang.NonNull;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.Set;
import java.util.stream.Collectors;

@Component
public class JwtAuthFilter extends OncePerRequestFilter {
	private final JwtService jwtService;
	private final UserRepo userRepo;

	public JwtAuthFilter(JwtService jwtService, UserRepo userRepo) {
		this.jwtService = jwtService;
		this.userRepo = userRepo;
	}

	@Override
	protected void doFilterInternal(@NonNull HttpServletRequest request, @NonNull HttpServletResponse response, @NonNull FilterChain filterChain)
			throws ServletException, IOException {
		String header = request.getHeader("Authorization");
		if (header != null && header.startsWith("Bearer ")) {
			String token = header.substring(7);
			// Debug logging to help diagnose 403s
			try {
				String tokenSnippet = token.length() > 20 ? token.substring(0, 8) + "..." + token.substring(token.length()-6) : token;
				System.out.println("[JwtAuth] Authorization header received. token_snippet=" + tokenSnippet);
				String username = jwtService.getSubject(token);
				System.out.println("[JwtAuth] Parsed subject=" + username);
				if (username != null && SecurityContextHolder.getContext().getAuthentication() == null) {
					// Try exact match first, then lowercase fallback
					// (handles both case-sensitive and case-insensitive DB collations)
					String trimmed = username.trim();
					String lowerName = trimmed.toLowerCase();
					AppUser u = userRepo.findById(trimmed).orElse(null);
					if (u == null && !trimmed.equals(lowerName) && lowerName != null) {
						u = userRepo.findById(lowerName).orElse(null);
					}
					String lookupName = u != null ? u.getUsername() : lowerName;
					System.out.println("[JwtAuth] subject=" + username + " lookupName=" + lookupName + " userFound=" + (u != null));
					if (u != null) {
						Set<SimpleGrantedAuthority> authorities = u.getRoles().stream()
								.map(Role::name)
								.map(r -> new SimpleGrantedAuthority("ROLE_" + r))
								.collect(Collectors.toSet());
						UsernamePasswordAuthenticationToken auth = new UsernamePasswordAuthenticationToken(lookupName, null, authorities);
						SecurityContextHolder.getContext().setAuthentication(auth);
						// Extra debug: log authorities and request path to diagnose 403s
						try {
							String auths = authorities.stream().map(Object::toString).sorted().collect(Collectors.joining(","));
							System.out.println("[JwtAuth] Authentication set for=" + lookupName + " authorities=[" + auths + "] path=" + request.getRequestURI());
						} catch (Exception ignored) {}
					}
				}
			} catch (Exception e) {
				System.out.println("[JwtAuth] token validation failed: " + e.getMessage());
				// invalid token -> ignore and continue without authentication
			}
		}
		filterChain.doFilter(request, response);
	}
}

