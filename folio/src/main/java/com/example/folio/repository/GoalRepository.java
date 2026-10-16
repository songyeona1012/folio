// 목표 데이터의 DB 조회와 저장 메서드를 정의합니다.
package com.example.folio.repository;

import com.example.folio.entity.Goal;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface GoalRepository extends JpaRepository<Goal, Long> {
    /** 새로 만든 목표가 위에 오도록 (수정해도 순서가 바뀌지 않는다) */
    @org.springframework.data.jpa.repository.Query(
        "select g from Goal g where g.ownerId=?#{T(com.example.folio.security.OwnerContext).id()} order by g.createdAt desc"
    )
    List<Goal> findAllByOrderByCreatedAtDesc();

    @org.springframework.data.jpa.repository.Query(
        "select x from Goal x where x.id=?1 and x.ownerId=?#{T(com.example.folio.security.OwnerContext).id()}"
    )
    java.util.Optional<Goal> findById(Long id);

    @org.springframework.data.jpa.repository.Query(
        "select x from Goal x where x.ownerId=?#{T(com.example.folio.security.OwnerContext).id()}"
    )
    java.util.List<Goal> findAll();

    @org.springframework.data.jpa.repository.Query(
        "select x from Goal x where x.id in ?1 and x.ownerId=?#{T(com.example.folio.security.OwnerContext).id()}"
    )
    java.util.List<Goal> findAllById(Iterable<Long> ids);

    @org.springframework.data.jpa.repository.Query(
        "select (count(x)>0) from Goal x where x.id=?1 and x.ownerId=?#{T(com.example.folio.security.OwnerContext).id()}"
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
