package com.example.eikensystem.repo;

import com.example.eikensystem.domain.Product;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ProductRepo extends JpaRepository<Product, String> {
}
