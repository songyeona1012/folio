// 회원가입·로그인과 암호 검증을 확인합니다.
package com.example.folio;

import com.example.folio.controller.AuthorAuthController;
import com.example.folio.entity.AuthorAccount;
import com.example.folio.repository.AuthorAccountRepository;
import com.example.folio.service.AuthorPasswords;
import java.lang.reflect.Proxy;
import java.util.*;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.web.server.ResponseStatusException;

public class AuthorAuthTests {

    static void check(boolean value, String message) {
        if (!value) throw new AssertionError(message);
    }

    static void rejected(Runnable action, int code) {
        try {
            action.run();
            throw new AssertionError("Expected rejection");
        } catch (ResponseStatusException e) {
            check(e.getStatusCode().value() == code, "Wrong status");
        }
    }

    @org.junit.jupiter.api.Test
    void signupAndLoginValidation() {
        var store = new HashMap<String, AuthorAccount>();
        var repo = (AuthorAccountRepository) Proxy.newProxyInstance(
            AuthorAuthTests.class.getClassLoader(),
            new Class[] { AuthorAccountRepository.class },
            (proxy, method, params) ->
                switch (method.getName()) {
                    case "existsByAuthorId" -> store.containsKey((String) params[0]);
                    case "findByAuthorId" -> Optional.ofNullable(store.get((String) params[0]));
                    case "saveAndFlush" -> {
                        var account = (AuthorAccount) params[0];
                        account.id = 1L;
                        store.put(account.authorId, account);
                        yield account;
                    }
                    default -> throw new UnsupportedOperationException(method.getName());
                }
        );
        var controller = new AuthorAuthController(repo, null);
        String password = "한글 암호 abc 123";
        var author = controller.signup(
            new AuthorAuthController.Signup("새 저자", "테스트저자", password, password)
        );
        check(author.id() == 1L, "Signup failed");
        check(!store.get(author.authorId()).passwordHash.contains(password), "Plaintext password");
        check(
            AuthorPasswords.matches(password, store.get(author.authorId()).passwordHash),
            "Hash verification"
        );
        check(
            !AuthorPasswords.hash(password).equals(store.get(author.authorId()).passwordHash),
            "Missing random salt"
        );
        rejected(
            () ->
                controller.signup(new AuthorAuthController.Signup("이름", "테스트저자", password, password)),
            409
        );
        rejected(
            () -> controller.signup(new AuthorAuthController.Signup("이름", "다른저자", password, "불일치")),
            400
        );
        rejected(
            () -> controller.signup(new AuthorAuthController.Signup("이름", "짧은암호", "123", "123")),
            400
        );
        rejected(
            () ->
                controller.login(
                    new AuthorAuthController.Login("테스트저자", "틀린 암호"),
                    new MockHttpServletRequest()
                ),
            401
        );
        var request = new MockHttpServletRequest();
        request.getSession().setAttribute("old", "value");
        controller.login(new AuthorAuthController.Login("테스트저자", password), request);
        check(request.getSession().getAttribute("old") == null, "Old session retained");
        check(request.getSession().getAttribute("authorId").equals(1L), "Session identity missing");
    }
}
