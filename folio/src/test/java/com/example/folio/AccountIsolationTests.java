// 계정별 데이터 분리와 프로필 변경·탈퇴 흐름을 검증합니다.
package com.example.folio;

import com.example.folio.FolioApplication;
import java.net.*;
import java.net.http.*;
import java.util.*;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.web.server.context.WebServerApplicationContext;

public class AccountIsolationTests {

    static final Map<HttpClient, String> editTokens = new IdentityHashMap<>();
    static String base;
    static final tools.jackson.databind.json.JsonMapper JSON =
        tools.jackson.databind.json.JsonMapper.builder().build();

    static HttpClient client() {
        return HttpClient.newBuilder()
            .cookieHandler(new CookieManager(null, CookiePolicy.ACCEPT_ALL))
            .build();
    }

    static HttpResponse<String> call(HttpClient c, String method, String path, String body) throws Exception {
        var b = HttpRequest.newBuilder(URI.create(base + path));
        if (editTokens.containsKey(c)) b.header("X-Profile-Edit", editTokens.get(c));
        if (body != null) b.header("Content-Type", "application/json");
        return c.send(
            b
                .method(
                    method,
                    body == null
                        ? HttpRequest.BodyPublishers.noBody()
                        : HttpRequest.BodyPublishers.ofString(body)
                )
                .build(),
            HttpResponse.BodyHandlers.ofString()
        );
    }

    static void ok(boolean b, String text) {
        if (!b) throw new AssertionError(text);
    }

    static String id(HttpResponse<String> r) {
        ok(r.statusCode() < 300, "Create failed " + r.statusCode() + " " + r.body());
        return JSON.readTree(r.body()).get("id").asText();
    }

    @org.junit.jupiter.api.Test
    void isolatesAccountsOverHttp() throws Exception {
        var app = new SpringApplication(FolioApplication.class);
        try (
            var context = app.run(
                "--server.port=0",
                "--spring.datasource.url=jdbc:h2:mem:tenantcheck;DB_CLOSE_DELAY=-1",
                "--spring.jpa.hibernate.ddl-auto=create-drop",
                "--spring.jpa.open-in-view=false",
                "--openai.api.key=",
                "--gemini.api.key=",
                "--logging.level.root=ERROR"
            )
        ) {
            base = "http://localhost:" + ((WebServerApplicationContext) context).getWebServer().getPort();
            var guest = client();
            ok(call(guest, "GET", "/api/management/rules", null).statusCode() == 401, "Guest API open");
            ok(call(guest, "GET", "/main", null).statusCode() == 302, "Guest page open");
            var a = client();
            var b = client();
            for (var entry : Map.of("alpha", a, "bravo", b).entrySet()) {
                String user = entry.getKey();
                String payload =
                    "{\"displayName\":\"" +
                    user +
                    "\",\"authorId\":\"" +
                    user +
                    "\",\"password\":\"password123\",\"passwordConfirm\":\"password123\"}";
                ok(
                    call(entry.getValue(), "POST", "/api/auth/signup", payload).statusCode() == 201,
                    "Signup failed"
                );
                ok(
                    call(
                        entry.getValue(),
                        "POST",
                        "/api/auth/login",
                        "{\"authorId\":\"" + user + "\",\"password\":\"password123\"}"
                    ).statusCode() == 200,
                    "Login failed"
                );
            }
            String date = java.time.LocalDate.now().toString();
            String rule = id(
                call(
                    a,
                    "POST",
                    "/api/management/rules",
                    "{\"title\":\"Alpha rule\",\"category\":\"daily\",\"startDate\":\"" +
                        date +
                        "\",\"intervalValue\":1,\"intervalUnit\":\"DAY\"}"
                )
            );
            ok(call(b, "GET", "/api/management/rules", null).body().equals("[]"), "Rule leak");
            ok(
                call(b, "DELETE", "/api/management/rules/" + rule, null).statusCode() == 404,
                "Cross-account rule delete"
            );
            String schedule = id(
                call(
                    a,
                    "POST",
                    "/api/schedules",
                    "{\"title\":\"Alpha private\",\"date\":\"" +
                        date +
                        "\",\"category\":\"todo\",\"private\":false}"
                )
            );
            ok(
                !call(b, "GET", "/api/schedules/date?value=" + date, null)
                    .body()
                    .contains("Alpha"),
                "Schedule leak"
            );
            ok(
                call(b, "PATCH", "/api/schedules/" + schedule, "{\"completed\":true}").statusCode() >= 400,
                "Cross-account schedule edit"
            );
            String diary = id(
                call(
                    a,
                    "POST",
                    "/api/dairy",
                    "{\"date\":\"" +
                        date +
                        "\",\"type\":\"FREEFORM\",\"rating\":3,\"content\":\"Alpha diary\"}"
                )
            );
            ok(call(b, "GET", "/api/dairy?date=" + date, null).statusCode() == 204, "Diary leak");
            id(
                call(
                    b,
                    "POST",
                    "/api/dairy",
                    "{\"date\":\"" +
                        date +
                        "\",\"type\":\"FREEFORM\",\"rating\":4,\"content\":\"Bravo diary\"}"
                )
            );
            ok(
                call(a, "GET", "/api/dairy?date=" + date, null)
                    .body()
                    .contains("Alpha diary"),
                "Same-day overwrite"
            );
            String goal = id(
                call(a, "POST", "/api/goals", "{\"title\":\"Alpha goal\",\"formType\":\"STUDY\"}")
            );
            ok(!call(b, "GET", "/api/goals", null).body().contains("Alpha"), "Goal leak");
            ok(
                call(a, "GET", "/api/auth/me", null).body().contains("default-mascot.png"),
                "Default profile missing"
            );
            ok(
                call(a, "PATCH", "/api/auth/profile", "{\"displayName\":\"Blocked\"}").statusCode() == 403,
                "Profile bypass without password"
            );
            ok(
                call(
                    a,
                    "POST",
                    "/api/auth/verify-password",
                    "{\"password\":\"wrong password\"}"
                ).statusCode() == 400,
                "Wrong password unlocked profile"
            );
            Thread.sleep(1050);
            var verified = call(a, "POST", "/api/auth/verify-password", "{\"password\":\"password123\"}");
            ok(verified.statusCode() == 200, "Password verification failed");
            editTokens.put(a, JSON.readTree(verified.body()).get("token").asText());
            ok(
                call(b, "PATCH", "/api/auth/profile", "{\"displayName\":\"Blocked\"}").statusCode() == 403,
                "Verification leaked across sessions"
            );
            ok(
                call(a, "PATCH", "/api/auth/profile", "{\"displayName\":\"New Alpha\"}").statusCode() == 200,
                "Profile edit failed"
            );
            ok(!call(b, "GET", "/api/auth/me", null).body().contains("New Alpha"), "Profile leak");
            String reportA = call(a, "POST", "/api/management/reports?period=week&date=" + date, null).body();
            String reportB = call(b, "POST", "/api/management/reports?period=week&date=" + date, null).body();
            ok(
                !JSON.readTree(reportA).get("id").asText().equals(JSON.readTree(reportB).get("id").asText()),
                "Shared report key"
            );
            String boundary = "FolioProfileBoundary";
            var multipart = new StringBuilder();
            for (var field : Map.of(
                "displayName",
                "Updated Alpha",
                "authorId",
                "alpha_updated",
                "email",
                "alpha@example.com",
                "password",
                "newpassword123",
                "passwordConfirm",
                "newpassword123",
                "resetImage",
                "false"
            ).entrySet()) {
                multipart
                    .append("--")
                    .append(boundary)
                    .append("\r\nContent-Disposition: form-data; name=\"")
                    .append(field.getKey())
                    .append("\"\r\n\r\n")
                    .append(field.getValue())
                    .append("\r\n");
            }
            multipart.append("--").append(boundary).append("--\r\n");
            var save = a.send(
                HttpRequest.newBuilder(URI.create(base + "/api/auth/profile/save"))
                    .header("Content-Type", "multipart/form-data; boundary=" + boundary)
                    .header("X-Profile-Edit", editTokens.get(a))
                    .POST(HttpRequest.BodyPublishers.ofString(multipart.toString()))
                    .build(),
                HttpResponse.BodyHandlers.ofString()
            );
            ok(save.statusCode() == 200, "Remember save failed " + save.statusCode() + save.body());
            ok(
                save.body().contains("alpha_updated") && save.body().contains("alpha@example.com"),
                "ID or email not saved"
            );
            ok(
                call(a, "PATCH", "/api/auth/profile", "{\"displayName\":\"Blocked\"}").statusCode() == 403,
                "Edit permission remained after save"
            );
            call(a, "POST", "/api/auth/logout", null);
            editTokens.remove(a);
            ok(
                call(
                    a,
                    "POST",
                    "/api/auth/login",
                    "{\"authorId\":\"alpha\",\"password\":\"password123\"}"
                ).statusCode() == 401,
                "Old login retained"
            );
            ok(
                call(
                    a,
                    "POST",
                    "/api/auth/login",
                    "{\"authorId\":\"alpha_updated\",\"password\":\"newpassword123\"}"
                ).statusCode() == 200,
                "Updated login failed"
            );
            ok(
                call(a, "DELETE", "/api/auth/account", null).statusCode() == 403,
                "Withdrawal bypassed password verification"
            );
            var me = JSON.readTree(call(a, "GET", "/api/auth/me", null).body());
            long departingId = me.get("id").asLong();
            var withdrawVerified = call(
                a,
                "POST",
                "/api/auth/verify-password",
                "{\"password\":\"newpassword123\"}"
            );
            ok(withdrawVerified.statusCode() == 200, "Withdrawal verification failed");
            editTokens.put(a, JSON.readTree(withdrawVerified.body()).get("token").asText());
            ok(call(a, "DELETE", "/api/auth/account", null).statusCode() == 204, "Withdrawal failed");
            ok(call(a, "GET", "/api/auth/me", null).statusCode() == 401, "Withdrawal session still active");
            ok(
                call(
                    a,
                    "POST",
                    "/api/auth/login",
                    "{\"authorId\":\"alpha_updated\",\"password\":\"newpassword123\"}"
                ).statusCode() == 401,
                "Deleted account can log in"
            );
            ok(
                call(b, "GET", "/api/dairy?date=" + date, null)
                    .body()
                    .contains("Bravo diary"),
                "Other account diary deleted"
            );
            var jdbc = context.getBean(org.springframework.jdbc.core.JdbcTemplate.class);
            for (String table : List.of("schedule", "recurring_rule", "dairy", "goals", "management_report"))
                ok(
                    jdbc.queryForObject(
                        "select count(*) from " + table + " where owner_id=?",
                        Long.class,
                        departingId
                    ) == 0L,
                    "Residual private data in " + table
                );
            System.out.println(
                "PASS: verified withdrawal, private-data removal, other-account preservation, logout invalidation, profile password gate, wrong-password rejection, session-scoped edit permission, guest blocking, two-account schedule/rule/diary/goal/report/profile isolation, same-day diaries, protected ID operations"
            );
        }
    }
}
