package com.example.folio.controller;

import com.example.folio.dto.ScheduleDto;
import com.example.folio.service.ScheduleService;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/schedules")
public class ScheduleController {

    private final ScheduleService scheduleService;

    public ScheduleController(ScheduleService scheduleService) {
        this.scheduleService = scheduleService;
    }

    /* 새 일정 */ @PostMapping
    public ResponseEntity<ScheduleDto> create(@RequestBody ScheduleDto dto) {
        return ResponseEntity.ok(scheduleService.create(dto));
    }

    /* 일정 수정 */ @PatchMapping("/{id}")
    public ResponseEntity<ScheduleDto> update(@PathVariable Long id, @RequestBody ScheduleDto dto) {
        return ResponseEntity.ok(scheduleService.update(id, dto));
    }

    /* 한 달 일정 */ @GetMapping
    public ResponseEntity<List<ScheduleDto>> getByMonth(@RequestParam int year, @RequestParam int month) {
        return ResponseEntity.ok(scheduleService.getByMonth(year, month));
    }

    /* 특정 날짜 */ @GetMapping("/date")
    public ResponseEntity<List<ScheduleDto>> getByDate(@RequestParam("value") String date) {
        return ResponseEntity.ok(scheduleService.getByDate(LocalDate.parse(date)));
    }

    /* 달력 화면 요약 (완료도 / 혼잡도 / 가장 가까운 일정 / 가장 가까운 건강 관리) */ @GetMapping("/summary")
    public ResponseEntity<Map<String, Object>> getSummary(@RequestParam int year, @RequestParam int month) {
        if (month < 1 || month > 12) {
            return ResponseEntity.badRequest().build();
        }
        return ResponseEntity.ok(scheduleService.getSummary(year, month));
    }

    /* 완료 / 미완료 */ @PatchMapping("/{id}/complete")
    public ResponseEntity<ScheduleDto> toggleComplete(@PathVariable Long id) {
        return ResponseEntity.ok(scheduleService.toggleCompleted(id));
    }

    /* 삭제 */ @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        scheduleService.delete(id);
        return ResponseEntity.noContent().build();
    }
}
