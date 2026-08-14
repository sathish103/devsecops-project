package com.devsecops.orderservice.controller;

import com.devsecops.orderservice.entity.OrderEntity;
import com.devsecops.orderservice.repository.OrderRepository;
import io.jsonwebtoken.Claims;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.client.RestTemplate;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/orders")
public class OrderController {
    private final OrderRepository repo;
    private final RestTemplate restTemplate = new RestTemplate();
    @Value("${product.service.url:http://localhost:8082}")
    private String productServiceUrl;

    public OrderController(OrderRepository repo) { this.repo = repo; }

    @PostMapping
    public ResponseEntity<?> create(@RequestBody Map<String, Object> body, Authentication auth) {
        Long userId = Long.valueOf((String)auth.getPrincipal());
        Long productId = Long.valueOf(String.valueOf(body.get("productId")));
        Integer quantity = Integer.valueOf(String.valueOf(body.get("quantity")));

        Map product = restTemplate.getForObject(productServiceUrl + "/api/products/" + productId, Map.class);
        if (product == null) return ResponseEntity.badRequest().body(Map.of("message", "Product not found"));
        Double price = Double.valueOf(String.valueOf(product.get("price")));
        OrderEntity order = new OrderEntity();
        order.setUserId(userId);
        order.setProductId(productId);
        order.setQuantity(quantity);
        order.setTotalPrice(price * quantity);
        OrderEntity saved = repo.save(order);
        return ResponseEntity.ok(saved);
    }

    @GetMapping("/{id}")
    public ResponseEntity<OrderEntity> get(@PathVariable Long id) {
        return repo.findById(id).map(ResponseEntity::ok).orElse(ResponseEntity.notFound().build());
    }

    @GetMapping("/my-orders")
    public List<OrderEntity> myOrders(Authentication auth) {
        Long userId = Long.valueOf((String)auth.getPrincipal());
        return repo.findByUserId(userId);
    }
}
