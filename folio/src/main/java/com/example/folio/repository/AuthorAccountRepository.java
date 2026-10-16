// 계정 데이터의 DB 조회와 저장 메서드를 정의합니다.
package com.example.folio.repository;

import com.example.folio.entity.AuthorAccount;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface AuthorAccountRepository extends JpaRepository<AuthorAccount, Long> {
    Optional<AuthorAccount> findByAuthorId(String authorId);
    boolean existsByAuthorId(String authorId);
}
