package com.example.eikensystem.web;

import com.example.eikensystem.domain.Scale;
import com.example.eikensystem.repo.ScaleRepo;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/scales")
@RequiredArgsConstructor
public class ScaleController {
    private final ScaleRepo scaleRepo;

    @GetMapping
    public List<Scale> list() { return scaleRepo.findAll(); }
}
