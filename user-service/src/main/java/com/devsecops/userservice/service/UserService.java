package com.devsecops.userservice.service;

import com.devsecops.userservice.dto.LoginRequest;
import com.devsecops.userservice.dto.RegisterRequest;
import com.devsecops.userservice.entity.User;

public interface UserService {
    User register(RegisterRequest req);
    String login(LoginRequest req);
    User findById(Long id);
    User findByEmail(String email);
}
