// 암호를 해시로 저장하고 입력한 암호가 일치하는지 검증합니다.
package com.example.folio.service;

import java.security.*;
import java.util.*;
import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.PBEKeySpec;

public final class AuthorPasswords {

    private static final int ITERATIONS = 600000;

    private AuthorPasswords() {}

    public static String hash(String password) {
        byte[] salt = new byte[16];
        new SecureRandom().nextBytes(salt);
        return (
            "pbkdf2-sha256$" +
            ITERATIONS +
            "$" +
            Base64.getEncoder().encodeToString(salt) +
            "$" +
            Base64.getEncoder().encodeToString(derive(password, salt, ITERATIONS))
        );
    }

    public static boolean matches(String password, String encoded) {
        try {
            String[] parts = encoded.split("\\$");
            if (parts.length != 4 || !parts[0].equals("pbkdf2-sha256")) return false;
            return MessageDigest.isEqual(
                Base64.getDecoder().decode(parts[3]),
                derive(password, Base64.getDecoder().decode(parts[2]), Integer.parseInt(parts[1]))
            );
        } catch (RuntimeException e) {
            return false;
        }
    }

    private static byte[] derive(String password, byte[] salt, int rounds) {
        PBEKeySpec spec = new PBEKeySpec(password.toCharArray(), salt, rounds, 256);
        try {
            return SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256").generateSecret(spec).getEncoded();
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("암호 저장 오류", e);
        } finally {
            spec.clearPassword();
        }
    }
}
