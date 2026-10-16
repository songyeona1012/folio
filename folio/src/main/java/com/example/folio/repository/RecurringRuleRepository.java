// 주기 규칙 데이터의 DB 조회와 저장 메서드를 정의합니다.
package com.example.folio.repository;

import com.example.folio.entity.RecurringRule;
import org.springframework.data.jpa.repository.JpaRepository;

public interface RecurringRuleRepository extends JpaRepository<RecurringRule, Long> {
    @org.springframework.data.jpa.repository.Query(
        "select x from RecurringRule x where x.id=?1 and x.ownerId=?#{T(com.example.folio.security.OwnerContext).id()}"
    )
    java.util.Optional<RecurringRule> findById(Long id);

    @org.springframework.data.jpa.repository.Query(
        "select x from RecurringRule x where x.ownerId=?#{T(com.example.folio.security.OwnerContext).id()}"
    )
    java.util.List<RecurringRule> findAll();

    @org.springframework.data.jpa.repository.Query(
        "select x from RecurringRule x where x.id in ?1 and x.ownerId=?#{T(com.example.folio.security.OwnerContext).id()}"
    )
    java.util.List<RecurringRule> findAllById(Iterable<Long> ids);

    @org.springframework.data.jpa.repository.Query(
        "select (count(x)>0) from RecurringRule x where x.id=?1 and x.ownerId=?#{T(com.example.folio.security.OwnerContext).id()}"
    )
    boolean existsById(Long id);

    default void deleteAllById(Iterable<? extends Long> ids) {
        deleteAll(
            findAllById(
                java.util.stream.StreamSupport.stream(ids.spliterator(), false)
                    .map(id -> (Long) id)
                    .toList()
            )
        );
    }
}
