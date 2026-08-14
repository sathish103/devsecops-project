package com.devsecops.userservice.controller;

import com.devsecops.userservice.dto.*;
import com.devsecops.userservice.entity.User;
import com.devsecops.userservice.service.UserService;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/auth")
public class AuthController {
    private final UserService userService;

    public AuthController(UserService userService) { this.userService = userService; }

    @PostMapping("/register")
    public ResponseEntity<UserResponse> register(@Validated @RequestBody RegisterRequest req) {
        User u = userService.register(req);
        return ResponseEntity.ok(new UserResponse(u.getId(), u.getName(), u.getEmail()));
    }

    @PostMapping("/login")
    public ResponseEntity<LoginResponse> login(@Validated @RequestBody LoginRequest req) {
        String token = userService.login(req);
        User u = userService.findByEmail(req.getEmail());
        return ResponseEntity.ok(new LoginResponse(token, new UserResponse(u.getId(), u.getName(), u.getEmail())));
    }
}
