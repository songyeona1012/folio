// 관리 기록지 데이터의 DB 조회와 저장 메서드를 정의합니다.
package com.example.folio.repository;

import com.example.folio.entity.ManagementReport;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ManagementReportRepository extends JpaRepository<ManagementReport, String> {
    @org.springframework.data.jpa.repository.Query(
        "select x from ManagementReport x where x.id=?1 and x.ownerId=?#{T(com.example.folio.security.OwnerContext).id()}"
    )
    java.util.Optional<ManagementReport> findById(String id);

    @org.springframework.data.jpa.repository.Query(
        "select x from ManagementReport x where x.ownerId=?#{T(com.example.folio.security.OwnerContext).id()}"
    )
    java.util.List<ManagementReport> findAll();

    @org.springframework.data.jpa.repository.Query(
        "select x from ManagementReport x where x.id in ?1 and x.ownerId=?#{T(com.example.folio.security.OwnerContext).id()}"
    )
    java.util.List<ManagementReport> findAllById(Iterable<String> ids);

    @org.springframework.data.jpa.repository.Query(
        "select (count(x)>0) from ManagementReport x where x.id=?1 and x.ownerId=?#{T(com.example.folio.security.OwnerContext).id()}"
    )
    boolean existsById(String id);

    default void deleteAllById(Iterable<? extends String> ids) {
        deleteAll(
            findAllById(
                java.util.stream.StreamSupport.stream(ids.spliterator(), false)
                    .map(id -> (String) id)
                    .toList()
            )
        );
    }
}
