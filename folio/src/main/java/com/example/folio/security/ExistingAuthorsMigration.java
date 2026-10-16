// 기존 로컬 DB의 계정 정보만 새 저장소로 한 번 옮깁니다.
package com.example.folio.security;

import com.example.folio.entity.AuthorAccount;
import com.example.folio.repository.AuthorAccountRepository;
import java.sql.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

@Component
public class ExistingAuthorsMigration implements ApplicationRunner {

    private final AuthorAccountRepository accounts;
    private final String url;
    private final String username, password;
    private final org.springframework.jdbc.core.JdbcTemplate jdbc;
    private static final org.slf4j.Logger log = org.slf4j.LoggerFactory.getLogger(
        ExistingAuthorsMigration.class
    );

    public ExistingAuthorsMigration(
        AuthorAccountRepository accounts,
        org.springframework.jdbc.core.JdbcTemplate jdbc,
        @Value("${spring.datasource.url}") String url,
        @Value("${FOLIO_LEGACY_DB_USERNAME:${spring.datasource.username:}}") String username,
        @Value("${FOLIO_LEGACY_DB_PASSWORD:${spring.datasource.password:}}") String password
    ) {
        this.accounts = accounts;
        this.jdbc = jdbc;
        this.url = url;
        this.username = username;
        this.password = password;
    }

    public void run(ApplicationArguments args) throws Exception {
        if (!url.equals("jdbc:h2:file:./data/folio-accounts")) return;
        jdbc.execute("create table if not exists folio_setup_state (state_key varchar(80) primary key)");
        if (
            jdbc.queryForObject(
                "select count(*) from folio_setup_state where state_key='legacy-authors-imported'",
                Integer.class
            ) > 0
        ) return;
        if (accounts.count() != 0 || !java.nio.file.Files.exists(java.nio.file.Path.of("data/folio.mv.db"))) {
            markImported();
            return;
        }
        // Original database stays untouched. Only account credentials are copied into the clean database.
        try (
            var connection = DriverManager.getConnection(
                "jdbc:h2:file:./data/folio;IFEXISTS=TRUE;ACCESS_MODE_DATA=r",
                username,
                password
            );
            var statement = connection.createStatement()
        ) {
            try (var tables = connection.getMetaData().getTables(null, null, "AUTHOR_ACCOUNT", null)) {
                if (!tables.next()) {
                    markImported();
                    return;
                }
            }
            var imported = new java.util.ArrayList<AuthorAccount>();
            try (
                var rows = statement.executeQuery(
                    "select author_id, display_name, password_hash, created_at from author_account"
                )
            ) {
                while (rows.next()) {
                    var account = new AuthorAccount();
                    account.authorId = rows.getString(1);
                    account.displayName = rows.getString(2);
                    account.passwordHash = rows.getString(3);
                    var created = rows.getTimestamp(4);
                    if (created != null) account.createdAt = created.toLocalDateTime();
                    imported.add(account);
                }
            }
            accounts.saveAllAndFlush(imported);
            markImported();
        } catch (java.sql.SQLException | org.springframework.dao.DataAccessException error) {
            log.warn(
                "기존 회원 정보를 가져오지 못했습니다. 원본 DB는 보존되어 있으며 서버는 계속 실행됩니다. 기존 DB 접속 설정을 확인해주세요. (오류 종류: {})",
                error.getClass().getSimpleName()
            );
        }
    }

    private void markImported() {
        jdbc.update(
            "merge into folio_setup_state (state_key) key(state_key) values ('legacy-authors-imported')"
        );
    }
}
