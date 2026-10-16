// 일정 데이터의 DB 조회와 저장 메서드를 정의합니다.
package com.example.folio.repository;

import com.example.folio.entity.Schedule;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ScheduleRepository extends JpaRepository<Schedule, Long> {
    interface CompletionSummary {
        Long getRuleId();
        Long getTotal();
        Long getDone();
    }

    @org.springframework.data.jpa.repository.Query(
        """
        select s.recurringId as ruleId, count(s) as total,
            sum(case when s.completed = true then 1 else 0 end) as done
        from Schedule s where s.ownerId=?#{T(com.example.folio.security.OwnerContext).id()} and s.recurringId is not null and s.cancelled = false
            and s.date <= :through group by s.recurringId
        """
    )
    List<CompletionSummary> summarizeCompletion(
        @org.springframework.data.repository.query.Param("through") LocalDate through
    );

    @org.springframework.data.jpa.repository.Query(
        "select (count(s)>0) from Schedule s where s.recurringId=?1 and s.date=?2 and s.ownerId=?#{T(com.example.folio.security.OwnerContext).id()}"
    )
    boolean existsByRecurringIdAndDate(Long recurringId, LocalDate date);

    @org.springframework.data.jpa.repository.Query(
        "select s from Schedule s where s.recurringId=?1 and s.date>=?2 and s.ownerId=?#{T(com.example.folio.security.OwnerContext).id()}"
    )
    List<Schedule> findByRecurringIdAndDateGreaterThanEqual(Long id, LocalDate date);

    // 특정 날짜의 일정 목록 (오른쪽 페이지 "금일 일정 목록"에 사용)
    @org.springframework.data.jpa.repository.Query(
        "select s from Schedule s where s.date=?1 and s.ownerId=?#{T(com.example.folio.security.OwnerContext).id()}"
    )
    List<Schedule> findByDate(LocalDate date);

    @org.springframework.data.jpa.repository.Query(
        "select s from Schedule s where s.date<=?1 and s.ownerId=?#{T(com.example.folio.security.OwnerContext).id()}"
    )
    List<Schedule> findByDateLessThanEqual(LocalDate date);

    // 한 달 범위의 일정 (달력 칸마다 태그 표시할 때 사용)
    @org.springframework.data.jpa.repository.Query(
        "select s from Schedule s where s.date between ?1 and ?2 and s.ownerId=?#{T(com.example.folio.security.OwnerContext).id()}"
    )
    List<Schedule> findByDateBetween(LocalDate start, LocalDate end);

    // ===== 대시보드 요약용 (추가) =====

    // 오늘 이후의 미완료 일정을 가까운 순서로 (가장 가까운 일정 계산용)
    List<Schedule> findTop30ByOwnerIdAndDateGreaterThanEqualAndCompletedFalseAndCancelledFalseOrderByDateAscTimeAsc(
        Long ownerId,
        LocalDate date
    );

    default List<Schedule> findTop30ByDateGreaterThanEqualAndCompletedFalseAndCancelledFalseOrderByDateAscTimeAsc(
        LocalDate date
    ) {
        return findTop30ByOwnerIdAndDateGreaterThanEqualAndCompletedFalseAndCancelledFalseOrderByDateAscTimeAsc(
            com.example.folio.security.OwnerContext.id(),
            date
        );
    }

    // 특정 카테고리에서 오늘 이후 가장 가까운 미완료 일정 1개 (가장 가까운 건강 관리 계산용)
    Optional<Schedule> findFirstByOwnerIdAndCategoryAndDateGreaterThanEqualAndCompletedFalseAndCancelledFalseOrderByDateAscTimeAsc(
        Long ownerId,
        String category,
        LocalDate date
    );

    default Optional<Schedule> findFirstByCategoryAndDateGreaterThanEqualAndCompletedFalseAndCancelledFalseOrderByDateAscTimeAsc(
        String category,
        LocalDate date
    ) {
        return findFirstByOwnerIdAndCategoryAndDateGreaterThanEqualAndCompletedFalseAndCancelledFalseOrderByDateAscTimeAsc(
            com.example.folio.security.OwnerContext.id(),
            category,
            date
        );
    }

    @org.springframework.data.jpa.repository.Query(
        "select x from Schedule x where x.id=?1 and x.ownerId=?#{T(com.example.folio.security.OwnerContext).id()}"
    )
    java.util.Optional<Schedule> findById(Long id);

    @org.springframework.data.jpa.repository.Query(
        "select x from Schedule x where x.ownerId=?#{T(com.example.folio.security.OwnerContext).id()}"
    )
    java.util.List<Schedule> findAll();

    @org.springframework.data.jpa.repository.Query(
        "select x from Schedule x where x.id in ?1 and x.ownerId=?#{T(com.example.folio.security.OwnerContext).id()}"
    )
    java.util.List<Schedule> findAllById(Iterable<Long> ids);

    @org.springframework.data.jpa.repository.Query(
        "select (count(x)>0) from Schedule x where x.id=?1 and x.ownerId=?#{T(com.example.folio.security.OwnerContext).id()}"
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
