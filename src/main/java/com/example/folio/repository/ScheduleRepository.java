package com.example.folio.repository;

import com.example.folio.entity.Schedule;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ScheduleRepository extends JpaRepository<Schedule, Long> {
    boolean existsByRecurringIdAndDate(Long recurringId, LocalDate date);
    List<Schedule> findByRecurringIdAndDateGreaterThanEqual(Long id, LocalDate date);
    // 특정 날짜의 일정 목록 (오른쪽 페이지 "금일 일정 목록"에 사용)
    List<Schedule> findByDate(LocalDate date);

    // 한 달 범위의 일정 (달력 칸마다 태그 표시할 때 사용)
    List<Schedule> findByDateBetween(LocalDate start, LocalDate end);

    // ===== 대시보드 요약용 (추가) =====

    // 오늘 이후의 미완료 일정을 가까운 순서로 (가장 가까운 일정 계산용)
    List<Schedule> findTop30ByDateGreaterThanEqualAndCompletedFalseAndCancelledFalseOrderByDateAscTimeAsc(
        LocalDate date);

    // 특정 카테고리에서 오늘 이후 가장 가까운 미완료 일정 1개 (가장 가까운 건강 관리 계산용)
    Optional<Schedule> findFirstByCategoryAndDateGreaterThanEqualAndCompletedFalseAndCancelledFalseOrderByDateAscTimeAsc(
        String category, LocalDate date);
}
