package com.example.folio.repository;

import com.example.folio.dto.DairyRatingRow;
import com.example.folio.entity.Dairy;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

public interface DairyRepository extends JpaRepository<Dairy, Long> {

    /** 특정 날짜의 일기 (하루 한 편) */
    Optional<Dairy> findByDate(LocalDate date);

    /** 기간 안의 일기 목록 (월별 폴더 열었을 때) */
    List<Dairy> findByDateBetweenOrderByDateAsc(LocalDate start, LocalDate end);

    /**
     * 연간 기분 그래프용: 날짜와 별점만 가볍게 가져옵니다.
     * (시간 기록형 내용까지 불러오지 않도록 별도 쿼리로 분리)
     */
    @Query("select new com.example.folio.dto.DairyRatingRow(d.date, d.rating) "
            + "from Dairy d where d.date between :start and :end")
    List<DairyRatingRow> findRatingsBetween(@Param("start") LocalDate start,
                                            @Param("end") LocalDate end);
}
