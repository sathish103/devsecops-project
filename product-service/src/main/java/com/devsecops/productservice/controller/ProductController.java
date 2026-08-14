package com.devsecops.productservice.controller;

import com.devsecops.productservice.entity.Product;
import com.devsecops.productservice.repository.ProductRepository;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import jakarta.validation.Valid;
import java.util.List;

@RestController
@RequestMapping("/api/products")
public class ProductController {
    private final ProductRepository repo;

    public ProductController(ProductRepository repo) { this.repo = repo; }

    @GetMapping
    public List<Product> list() { return repo.findAll(); }

    @GetMapping("/{id}")
    public ResponseEntity<Product> get(@PathVariable Long id) {
        return repo.findById(id).map(ResponseEntity::ok).orElse(ResponseEntity.notFound().build());
    }

    @PostMapping
    public Product create(@Valid @RequestBody Product p, Authentication auth) { return repo.save(p); }

    @PutMapping("/{id}")
    public ResponseEntity<Product> update(@PathVariable Long id, @Valid @RequestBody Product p, Authentication auth) {
        return repo.findById(id).map(existing -> {
            existing.setName(p.getName()); existing.setDescription(p.getDescription()); existing.setPrice(p.getPrice()); existing.setQuantity(p.getQuantity());
            return ResponseEntity.ok(repo.save(existing));
        }).orElse(ResponseEntity.notFound().build());
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<?> delete(@PathVariable Long id, Authentication auth) {
        return repo.findById(id).map(existing -> { repo.delete(existing); return ResponseEntity.noContent().build(); }).orElse(ResponseEntity.notFound().build());
    }
}
