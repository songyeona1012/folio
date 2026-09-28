package com.example.folio.service;

import com.example.folio.dto.ScheduleDto;
import com.example.folio.entity.Schedule;
import com.example.folio.repository.ScheduleRepository;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;

@Service
public class ScheduleService {

    private final ScheduleRepository scheduleRepository;

    private final RecurringService recurring;

    public ScheduleService(ScheduleRepository scheduleRepository, RecurringService recurring) {
        this.recurring = recurring;
        this.scheduleRepository = scheduleRepository;
    }

    public ScheduleDto create(ScheduleDto dto) {
        Schedule schedule = new Schedule(
            dto.getTitle(),
            LocalDate.parse(dto.getDate()),
            dto.getTime() == null || dto.getTime().isBlank() ? null : LocalTime.parse(dto.getTime()),
            dto.getCategory(),
            dto.isPrivate()
        );

        return toDto(scheduleRepository.save(schedule));
    }

    /* =========================================================
       일정 수정
       ========================================================= */

    public ScheduleDto update(Long id, ScheduleDto dto) {
        Schedule schedule = scheduleRepository
            .findById(id)
            .orElseThrow(() -> new IllegalArgumentException("해당 일정을 찾을 수 없어요. id=" + id));

        if (dto.getTitle() != null) {
            schedule.setTitle(dto.getTitle());
        }

        if (dto.getTime() != null) {
            if (dto.getTime().isBlank()) {
                schedule.setTime(null);
            } else {
                schedule.setTime(LocalTime.parse(dto.getTime()));
            }
        }

        return toDto(scheduleRepository.save(schedule));
    }

    public List<ScheduleDto> getByDate(LocalDate date) {
        recurring.ensure(date, date);
        return scheduleRepository
            .findByDate(date)
            .stream()
            .filter(s -> !s.isCancelled())
            .map(this::toDto)
            .collect(Collectors.toList());
    }

    public List<ScheduleDto> getByMonth(int year, int month) {
        LocalDate start = LocalDate.of(year, month, 1);

        LocalDate end = start.plusMonths(1).minusDays(1);

        recurring.ensure(start, end);
        return scheduleRepository
            .findByDateBetween(start, end)
            .stream()
            .filter(s -> !s.isCancelled())
            .map(this::toDto)
            .collect(Collectors.toList());
    }

    public ScheduleDto toggleCompleted(Long id) {
        Schedule schedule = scheduleRepository
            .findById(id)
            .orElseThrow(() -> new IllegalArgumentException("해당 일정을 찾을 수 없어요. id=" + id));

        schedule.setCompleted(!schedule.isCompleted());

        return toDto(scheduleRepository.save(schedule));
    }

    public void delete(Long id) {
        Schedule schedule = scheduleRepository.findById(id).orElseThrow();
        if (schedule.getRecurringId() == null) scheduleRepository.delete(schedule);
        else {
            schedule.setCancelled(true);
            scheduleRepository.save(schedule);
        }
    }

    private ScheduleDto toDto(Schedule schedule) {
        ScheduleDto dto = new ScheduleDto();

        dto.setId(schedule.getId());

        dto.setTitle(schedule.getTitle());

        dto.setDate(schedule.getDate().toString());

        dto.setTime(schedule.getTime() == null ? null : schedule.getTime().toString());

        dto.setCategory(schedule.getCategory());

        dto.setPrivate(schedule.isPrivate());

        dto.setCompleted(schedule.isCompleted());

        return dto;
    }
}
