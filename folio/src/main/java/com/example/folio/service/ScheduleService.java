package com.example.folio.service;

import com.example.folio.dto.ScheduleDto;
import com.example.folio.entity.Schedule;
import com.example.folio.repository.ScheduleRepository;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.YearMonth;
import java.time.ZoneId;
import java.time.format.TextStyle;
import java.time.temporal.ChronoUnit;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
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

        // 프론트(main.js)의 PATCH는 항상 title, time, completed를 함께 보냅니다.
        // 이 줄이 없으면 체크박스로 완료해도 DB에 저장되지 않아 일정 완료도가 바뀌지 않습니다.
        schedule.setCompleted(dto.isCompleted());

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
        dto.setRecurringId(schedule.getRecurringId());

        dto.setTitle(schedule.getTitle());

        dto.setDate(schedule.getDate().toString());

        dto.setTime(schedule.getTime() == null ? null : schedule.getTime().toString());

        dto.setCategory(schedule.getCategory());

        dto.setPrivate(schedule.isPrivate());

        dto.setCompleted(schedule.isCompleted());

        return dto;
    }

    /* =========================================================
       달력 화면 요약
       (일정 완료도 / 혼잡도 / 가장 가까운 일정 / 가장 가까운 건강 관리)
       ========================================================= */

    private static final ZoneId ZONE = ZoneId.of("Asia/Seoul");

    // 같은 날 같은 시간대(오전/오후/저녁)에 이 개수 이상이면 "밀집"
    private static final int CROWDED_SLOT_COUNT = 3;

    // 하루 전체 일정이 이 개수 이상이면 "많음"
    private static final int BUSY_DAY_COUNT = 4;

    // 혼잡도를 살펴볼 기간 (오늘 포함 7일)
    private static final int CONGESTION_DAYS = 7;

    // 반복 일정(건강 관리 등)을 미리 만들어 둘 기간
    private static final int LOOKAHEAD_MONTHS = 3;

    public Map<String, Object> getSummary(int year, int month) {
        LocalDate today = LocalDate.now(ZONE);
        LocalTime now = LocalTime.now(ZONE).withSecond(0).withNano(0);

        // 반복 일정은 조회할 때 만들어지므로, 요약 계산 전에 필요한 범위를 채워 둡니다.
        YearMonth ym = YearMonth.of(year, month);
        recurring.ensure(ym.atDay(1), ym.atEndOfMonth());
        recurring.ensure(today, today.plusMonths(LOOKAHEAD_MONTHS));

        Map<String, Object> summary = new LinkedHashMap<>();

        fillCompletion(summary, ym, today);
        summary.put("congestion", buildCongestion(today));
        summary.put("nextEvent", buildNextEvent(today, now));
        fillNextHealth(summary, today);

        return summary;
    }

    // 1. 일정 완료도: 보고 있는 달에서 "오늘까지" 날짜의 일정만 대상
    //    (아직 오지 않은 일정은 완료할 수 없으니 제외)
    private void fillCompletion(Map<String, Object> summary, YearMonth ym, LocalDate today) {
        LocalDate start = ym.atDay(1);
        LocalDate end = ym.atEndOfMonth().isAfter(today) ? today : ym.atEndOfMonth();

        List<Schedule> list = start.isAfter(end)
            ? List.of()
            : scheduleRepository.findByDateBetween(start, end).stream()
            .filter(s -> !s.isCancelled())
            .collect(Collectors.toList());

        int total = list.size();
        int completed = (int) list.stream().filter(Schedule::isCompleted).count();

        summary.put("completionRate", total == 0 ? null : (int) Math.round(completed * 100.0 / total));
        summary.put("completedCount", completed);
        summary.put("totalCount", total);
    }

    // 2. 혼잡도: 오늘부터 7일간 미완료 일정을 날짜 + 시간대별로 세어 가장 몰린 곳을 알려줌
    private String buildCongestion(LocalDate today) {
        List<Schedule> list = scheduleRepository
            .findByDateBetween(today, today.plusDays(CONGESTION_DAYS - 1)).stream()
            .filter(s -> !s.isCancelled() && !s.isCompleted())
            .sorted(byDateThenTime())
            .collect(Collectors.toList());

        if (list.isEmpty()) {
            return "앞으로 일주일 동안 예정된 일정이 없어요.";
        }

        Map<String, Integer> slotCounts = new LinkedHashMap<>();   // "날짜|시간대" → 개수
        Map<LocalDate, Integer> dayCounts = new LinkedHashMap<>(); // 날짜 → 개수

        for (Schedule s : list) {
            dayCounts.merge(s.getDate(), 1, Integer::sum);

            if (s.getTime() != null) {
                slotCounts.merge(s.getDate() + "|" + timeSlot(s.getTime()), 1, Integer::sum);
            }
        }

        // 가장 몰린 시간대 (개수가 같으면 더 가까운 날짜)
        String busiestSlot = null;
        int slotMax = 0;

        for (Map.Entry<String, Integer> e : slotCounts.entrySet()) {
            if (e.getValue() > slotMax) {
                busiestSlot = e.getKey();
                slotMax = e.getValue();
            }
        }

        if (slotMax >= CROWDED_SLOT_COUNT) {
            String[] parts = busiestSlot.split("\\|");
            return dayLabel(LocalDate.parse(parts[0]), today) + " " + parts[1] + "에 일정이 밀집되어있습니다.";
        }

        // 시간대로는 안 몰렸지만 하루 전체로 많은 날
        LocalDate busiestDay = null;
        int dayMax = 0;

        for (Map.Entry<LocalDate, Integer> e : dayCounts.entrySet()) {
            if (e.getValue() > dayMax) {
                busiestDay = e.getKey();
                dayMax = e.getValue();
            }
        }

        if (dayMax >= BUSY_DAY_COUNT) {
            return dayLabel(busiestDay, today) + "에 일정이 많습니다.";
        }

        return "이번 주 일정은 여유로운 편이에요.";
    }

    // 3. 가장 가까운 일정: 지금 이후의 미완료 일정 중 가장 빠른 것
    //    (오늘 일정인데 시간이 이미 지났으면 건너뜀)
    private String buildNextEvent(LocalDate today, LocalTime now) {
        Optional<Schedule> next = scheduleRepository
            .findTop30ByDateGreaterThanEqualAndCompletedFalseAndCancelledFalseOrderByDateAscTimeAsc(today)
            .stream()
            .filter(s -> !(s.getDate().equals(today) && s.getTime() != null && s.getTime().isBefore(now)))
            .sorted(byDateThenTime())
            .findFirst();

        if (next.isEmpty()) {
            return null;
        }

        Schedule s = next.get();
        String when = dayLabel(s.getDate(), today) + (s.getTime() != null ? " " + formatTime(s.getTime()) : "");

        return "[" + when + "] " + s.getTitle();
    }

    // 4. 가장 가까운 건강 관리: category = "health" 인 미완료 일정 중 가장 가까운 것
    private void fillNextHealth(Map<String, Object> summary, LocalDate today) {
        Optional<Schedule> health = scheduleRepository
            .findFirstByCategoryAndDateGreaterThanEqualAndCompletedFalseAndCancelledFalseOrderByDateAscTimeAsc(
                "health", today);

        summary.put("nextHealthTitle", health.map(Schedule::getTitle).orElse(null));
        summary.put("nextHealthDays", health.map(s -> (int) ChronoUnit.DAYS.between(today, s.getDate())).orElse(null));
    }

    // 날짜순, 같은 날이면 시간순 (시간 없는 일정은 뒤로)
    private Comparator<Schedule> byDateThenTime() {
        return Comparator.comparing(Schedule::getDate)
            .thenComparing(Schedule::getTime, Comparator.nullsLast(Comparator.naturalOrder()));
    }

    // 오늘 / 내일 / 모레 / 10월 3일(토)
    private String dayLabel(LocalDate date, LocalDate today) {
        long diff = ChronoUnit.DAYS.between(today, date);

        if (diff == 0) return "오늘";
        if (diff == 1) return "내일";
        if (diff == 2) return "모레";

        return date.getMonthValue() + "월 " + date.getDayOfMonth() + "일("
            + date.getDayOfWeek().getDisplayName(TextStyle.SHORT, Locale.KOREAN) + ")";
    }

    // 12시 전 = 오전, 18시 전 = 오후, 그 이후 = 저녁
    private String timeSlot(LocalTime time) {
        if (time.getHour() < 12) return "오전";
        if (time.getHour() < 18) return "오후";
        return "저녁";
    }

    // 16:40 → "오후 4시 40분", 09:00 → "오전 9시" (프론트 formatTime과 같은 모양)
    private String formatTime(LocalTime time) {
        int h = time.getHour();
        int m = time.getMinute();
        int h12 = h % 12 == 0 ? 12 : h % 12;

        return (h < 12 ? "오전" : "오후") + " " + h12 + "시" + (m != 0 ? " " + m + "분" : "");
    }
}
