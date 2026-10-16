// 회원가입·로그인·암호 확인·프로필 저장·탈퇴 요청을 처리합니다.
package com.example.folio.controller;

import com.example.folio.entity.AuthorAccount;
import com.example.folio.repository.AuthorAccountRepository;
import com.example.folio.service.AccountClosureService;
import com.example.folio.service.AuthorPasswords;
import jakarta.servlet.http.HttpServletRequest;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.Base64;
import java.util.Map;
import java.util.UUID;
import javax.imageio.ImageIO;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/auth")
public class AuthorAuthController {

    private final AuthorAccountRepository accounts;
    private final AccountClosureService closure;

    public AuthorAuthController(AuthorAccountRepository accounts, AccountClosureService closure) {
        this.accounts = accounts;
        this.closure = closure;
    }

    public record Signup(String displayName, String authorId, String password, String passwordConfirm) {}

    public record Login(String authorId, String password) {}

    public record Author(Long id, String authorId, String displayName, String avatar, String email) {}

    @PostMapping(value = "/signup", consumes = "application/json")
    @ResponseStatus(HttpStatus.CREATED)
    public Author signup(@RequestBody Signup input) {
        String name = input.displayName() == null ? "" : input.displayName().strip();
        String id = input.authorId() == null ? "" : input.authorId().strip();
        if (
            name.isEmpty() || name.length() > 40 || !id.matches("[\\p{L}\\p{N}_-]{2,30}")
        ) throw new ResponseStatusException(
            HttpStatus.BAD_REQUEST,
            "이름과 저자명(한글·영문·숫자·_·-, 2~30자)을 확인해주세요."
        );
        if (
            input.password() == null ||
            input.password().length() < 8 ||
            input.password().length() > 128 ||
            input.password().isBlank()
        ) throw new ResponseStatusException(
            HttpStatus.BAD_REQUEST,
            "암호는 공백만 사용하지 않고 8~128자로 입력해주세요."
        );
        if (!input.password().equals(input.passwordConfirm())) throw new ResponseStatusException(
            HttpStatus.BAD_REQUEST,
            "암호가 일치하지 않습니다."
        );
        if (accounts.existsByAuthorId(id)) throw new ResponseStatusException(
            HttpStatus.CONFLICT,
            "이미 사용 중인 저자명이에요."
        );
        AuthorAccount account = new AuthorAccount();
        account.authorId = id;
        account.displayName = name;
        account.passwordHash = AuthorPasswords.hash(input.password());
        try {
            accounts.saveAndFlush(account);
        } catch (DataIntegrityViolationException e) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "이미 사용 중인 저자명이에요.");
        }
        return author(account);
    }

    @PostMapping(value = "/login", consumes = "application/json")
    public Author login(@RequestBody Login input, HttpServletRequest request) {
        if (
            input.authorId() == null || input.password() == null || input.password().length() > 128
        ) throw invalid();
        AuthorAccount account = accounts.findByAuthorId(input.authorId().strip()).orElseThrow(this::invalid);
        if (!AuthorPasswords.matches(input.password(), account.passwordHash)) throw invalid();
        var session = request.getSession(false);
        if (session != null) session.invalidate();
        request.getSession(true).setAttribute("authorId", account.id);
        request.getSession().setAttribute("authorName", account.displayName);
        request.getSession().setAttribute("authorLogin", account.authorId);
        return author(account);
    }

    @GetMapping("/me")
    public Author me() {
        return author(current());
    }

    @PostMapping(value = "/verify-password", consumes = "application/json")
    public Map<String, String> verifyPassword(
        @RequestBody Map<String, String> input,
        HttpServletRequest request
    ) {
        var session = request.getSession();
        session.removeAttribute("profileEditToken");
        long now = System.currentTimeMillis();
        Object last = session.getAttribute("profileVerifyAttempt");
        if (last instanceof Long time && now - time < 1000) throw new ResponseStatusException(
            HttpStatus.TOO_MANY_REQUESTS,
            "잠시 후 다시 확인해주세요."
        );
        session.setAttribute("profileVerifyAttempt", now);
        String password = input.getOrDefault("password", "");
        if (
            password.length() > 128 || !AuthorPasswords.matches(password, current().passwordHash)
        ) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "암호를 확인해주세요.");
        String token = UUID.randomUUID().toString();
        session.setAttribute("profileEditToken", token);
        session.setAttribute("profileEditUntil", now + 600000L);
        return Map.of("token", token);
    }

    private HttpServletRequest request() {
        return ((ServletRequestAttributes) RequestContextHolder.currentRequestAttributes()).getRequest();
    }

    private void requireEdit() {
        var req = request();
        var session = req.getSession(false);
        if (
            session == null ||
            !(session.getAttribute("profileEditUntil") instanceof Long until) ||
            until < System.currentTimeMillis() ||
            !(session.getAttribute("profileEditToken") instanceof String token) ||
            !token.equals(req.getHeader("X-Profile-Edit"))
        ) throw new ResponseStatusException(HttpStatus.FORBIDDEN, "현재 암호를 먼저 확인해주세요.");
    }

    @PatchMapping(value = "/profile", consumes = "application/json")
    @Transactional
    public Author profile(@RequestBody Map<String, String> input) {
        requireEdit();
        var account = current();
        String name = input.getOrDefault("displayName", "").strip();
        String id = input.getOrDefault("authorId", account.authorId).strip();
        String email = input.getOrDefault("email", account.email == null ? "" : account.email).strip();
        if (name.isBlank() || name.length() > 40) throw new ResponseStatusException(
            HttpStatus.BAD_REQUEST,
            "이름은 1~40자로 입력해주세요."
        );
        if (!id.matches("[\\p{L}\\p{N}_-]{2,30}")) throw new ResponseStatusException(
            HttpStatus.BAD_REQUEST,
            "저자명은 한글·영문·숫자·_·-로 2~30자 입력해주세요."
        );
        if (!id.equals(account.authorId) && accounts.existsByAuthorId(id)) throw new ResponseStatusException(
            HttpStatus.CONFLICT,
            "이미 사용 중인 저자명이에요."
        );
        if (
            email.length() > 254 || (!email.isEmpty() && !email.matches("[^\\s@]+@[^\\s@]+\\.[^\\s@]+"))
        ) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "이메일 주소를 확인해주세요.");
        String password = input.getOrDefault("password", "");
        if (!password.isEmpty()) {
            if (
                password.length() < 8 || password.length() > 128 || password.isBlank()
            ) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "암호는 8~128자로 입력해주세요.");
            if (!password.equals(input.get("passwordConfirm"))) throw new ResponseStatusException(
                HttpStatus.BAD_REQUEST,
                "암호가 일치하지 않습니다."
            );
            account.passwordHash = AuthorPasswords.hash(password);
        }
        account.displayName = name;
        account.authorId = id;
        account.email = email;
        account.lastModifiedAt = java.time.LocalDateTime.now();
        try {
            return author(accounts.saveAndFlush(account));
        } catch (DataIntegrityViolationException e) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "이미 사용 중인 저자명이에요.");
        }
    }

    @PostMapping(value = "/profile/save", consumes = "multipart/form-data")
    @Transactional
    public Author saveProfile(
        @RequestParam Map<String, String> input,
        @RequestPart(value = "image", required = false) MultipartFile image
    ) throws IOException {
        requireEdit();
        String avatar = image != null && !image.isEmpty() ? decodeImage(image) : null;
        if ("true".equals(input.get("resetImage"))) avatar = "/img/default-mascot.png";
        profile(input);
        var account = current();
        if (avatar != null) account.avatar = avatar;
        var result = author(accounts.saveAndFlush(account));
        request().getSession().removeAttribute("profileEditToken");
        return result;
    }

    @PostMapping(value = "/profile/image", consumes = "multipart/form-data")
    public Author image(@RequestParam("image") MultipartFile file) throws IOException {
        requireEdit();
        var account = current();
        account.avatar = decodeImage(file);
        account.lastModifiedAt = java.time.LocalDateTime.now();
        return author(accounts.saveAndFlush(account));
    }

    private String decodeImage(MultipartFile file) throws IOException {
        if (file.isEmpty() || file.getSize() > 2 * 1024 * 1024) throw new ResponseStatusException(
            HttpStatus.BAD_REQUEST,
            "사진은 2MB 이하로 선택해주세요."
        );
        try (var stream = ImageIO.createImageInputStream(file.getInputStream())) {
            var readers = ImageIO.getImageReaders(stream);
            if (!readers.hasNext()) throw new ResponseStatusException(
                HttpStatus.BAD_REQUEST,
                "PNG 또는 JPG 사진을 선택해주세요."
            );
            var reader = readers.next();
            try {
                reader.setInput(stream);
                String format = reader.getFormatName();
                if (
                    !(format.equalsIgnoreCase("png") || format.equalsIgnoreCase("jpeg")) ||
                    reader.getWidth(0) > 2048 ||
                    reader.getHeight(0) > 2048
                ) throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "PNG·JPG, 최대 2048×2048 크기로 선택해주세요."
                );
                var output = new ByteArrayOutputStream();
                ImageIO.write(reader.read(0), "png", output);
                return "data:image/png;base64," + Base64.getEncoder().encodeToString(output.toByteArray());
            } finally {
                reader.dispose();
            }
        }
    }

    @DeleteMapping("/profile/image")
    public Author resetImage() {
        requireEdit();
        var account = current();
        account.avatar = "/img/default-mascot.png";
        account.lastModifiedAt = java.time.LocalDateTime.now();
        return author(accounts.saveAndFlush(account));
    }

    @DeleteMapping("/account")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void withdraw(HttpServletRequest request) {
        requireEdit();
        closure.closeCurrentAccount();
        var session = request.getSession(false);
        if (session != null) session.invalidate();
    }

    @PostMapping("/logout")
    public void logout(HttpServletRequest request) {
        var session = request.getSession(false);
        if (session != null) session.invalidate();
    }

    private AuthorAccount current() {
        return accounts
            .findById(com.example.folio.security.OwnerContext.id())
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED));
    }

    private ResponseStatusException invalid() {
        return new ResponseStatusException(HttpStatus.UNAUTHORIZED, "저자명 또는 암호를 확인해주세요.");
    }

    private Author author(AuthorAccount a) {
        return new Author(
            a.id,
            a.authorId,
            a.displayName,
            a.avatar == null || (!a.avatar.startsWith("data:image/") && !a.avatar.startsWith("/img/"))
                ? "/img/default-mascot.png"
                : a.avatar,
            a.email
        );
    }
}
