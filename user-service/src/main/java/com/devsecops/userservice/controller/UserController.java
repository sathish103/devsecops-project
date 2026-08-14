package com.devsecops.userservice.controller;

import com.devsecops.userservice.dto.UserResponse;
import com.devsecops.userservice.entity.User;
import com.devsecops.userservice.service.UserService;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/users")
public class UserController {
    private final UserService userService;

    public UserController(UserService userService) { this.userService = userService; }

    @GetMapping("/me")
    public ResponseEntity<UserResponse> me(Authentication authentication) {
        Long userId = Long.valueOf((String)authentication.getPrincipal());
        User u = userService.findById(userId);
        return ResponseEntity.ok(new UserResponse(u.getId(), u.getName(), u.getEmail()));
    }
}
