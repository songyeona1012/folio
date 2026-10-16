// 일기 데이터의 DB 조회와 저장 메서드를 정의합니다.
package com.example.folio.repository;

import com.example.folio.dto.DairyRatingRow;
import com.example.folio.entity.Dairy;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface DairyRepository extends JpaRepository<Dairy, Long> {
    /** 특정 날짜의 일기 (하루 한 편) */
    @Query(
        "select d from Dairy d where d.date=?1 and d.ownerId=?#{T(com.example.folio.security.OwnerContext).id()}"
    )
    Optional<Dairy> findByDate(LocalDate date);

    /** 기간 안의 일기 목록 (월별 폴더 열었을 때) */
    @Query(
        "select d from Dairy d where d.date between ?1 and ?2 and d.ownerId=?#{T(com.example.folio.security.OwnerContext).id()} order by d.date asc"
    )
    List<Dairy> findByDateBetweenOrderByDateAsc(LocalDate start, LocalDate end);

    /**
     * 연간 기분 그래프용: 날짜와 별점만 가볍게 가져옵니다.
     * (시간 기록형 내용까지 불러오지 않도록 별도 쿼리로 분리)
     */
    @Query(
        "select new com.example.folio.dto.DairyRatingRow(d.date, d.rating) " +
            "from Dairy d where d.ownerId=?#{T(com.example.folio.security.OwnerContext).id()} and d.date between :start and :end"
    )
    List<DairyRatingRow> findRatingsBetween(@Param("start") LocalDate start, @Param("end") LocalDate end);

    @org.springframework.data.jpa.repository.Query(
        "select x from Dairy x where x.id=?1 and x.ownerId=?#{T(com.example.folio.security.OwnerContext).id()}"
    )
    java.util.Optional<Dairy> findById(Long id);

    @org.springframework.data.jpa.repository.Query(
        "select x from Dairy x where x.ownerId=?#{T(com.example.folio.security.OwnerContext).id()}"
    )
    java.util.List<Dairy> findAll();

    @org.springframework.data.jpa.repository.Query(
        "select x from Dairy x where x.id in ?1 and x.ownerId=?#{T(com.example.folio.security.OwnerContext).id()}"
    )
    java.util.List<Dairy> findAllById(Iterable<Long> ids);

    @org.springframework.data.jpa.repository.Query(
        "select (count(x)>0) from Dairy x where x.id=?1 and x.ownerId=?#{T(com.example.folio.security.OwnerContext).id()}"
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
