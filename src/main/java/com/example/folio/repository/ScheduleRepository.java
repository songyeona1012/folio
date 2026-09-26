package com.example.folio.repository;

import com.example.folio.entity.Schedule;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDate;
import java.util.List;

public interface ScheduleRepository extends JpaRepository<Schedule, Long> {

    // 특정 날짜의 일정 목록 (오른쪽 페이지 "금일 일정 목록"에 사용)
    List<Schedule> findByDate(LocalDate date);

    // 한 달 범위의 일정 (달력 칸마다 태그 표시할 때 사용)
    List<Schedule> findByDateBetween(LocalDate start, LocalDate end);
}