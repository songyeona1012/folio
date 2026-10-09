package com.example.folio.service;

import com.example.folio.entity.*;
import com.example.folio.repository.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.*;
import java.time.temporal.TemporalAdjusters;
import java.util.*;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

@Service
public class ManagementAnalytics {

    private final ScheduleRepository schedules;
    private final DiarySignalSource diaries;
    private final ManagementReportRepository reports;
    private final RecurringService recurring;
    private final AiService ai;
    private static final List<String> NEGATIVE = List.of(
        "힘들",
        "힘든",
        "불안",
        "우울",
        "지쳤",
        "피곤",
        "스트레스",
        "슬프",
        "슬펐",
        "화났",
        "속상",
        "걱정",
        "괴로",
        "외로"
    );
    private static final List<String> POSITIVE = List.of(
        "행복",
        "즐거",
        "즐겁",
        "기쁘",
        "기뻤",
        "감사",
        "편안",
        "뿌듯",
        "좋았",
        "좋은",
        "만족",
        "설레",
        "신났"
    );
    public static final String METHOD =
        "현재 일기·별점 저장은 연결 전이므로 일정 혼잡도만 반영합니다. 일기 연결 후 적용할 계산 기준: 압박감 추정(0~100): 일정 혼잡도 40%, 일기 표현 35%, 별점 25%. 혼잡도는 하루 6건을 100점으로 환산합니다. 표현은 사전 기반으로 문장별 긍정·부정 표현을 세고, 별점은 (5−별점)÷4×100으로 환산합니다. 없는 지표의 비중은 제외해 다시 나눕니다. 일정과 일기가 모두 없는 날은 점수 없음으로 표시합니다. 미래는 일정만 반영한 계획 추정입니다. 감정 표현은 문맥을 오해할 수 있으며 의료·심리 진단이 아닙니다.";

    public ManagementAnalytics(
        ScheduleRepository schedules,
        DiarySignalSource diaries,
        ManagementReportRepository reports,
        RecurringService recurring,
        AiService ai
    ) {
        this.schedules = schedules;
        this.diaries = diaries;
        this.reports = reports;
        this.recurring = recurring;
        this.ai = ai;
    }

    public record CompletionPoint(String date, Map<String, Integer> rates, boolean forecast) {}
    public record CompletionChart(String start, String end, List<CompletionPoint> points,
        int scheduleCount, int completedCount, Integer completionRate, String method) {}

    public CompletionChart completionChart(String period, LocalDate anchor) {
        Range range = range(period, anchor);
        LocalDate today = LocalDate.now();
        List<String> categories = List.of("health", "subscription", "relationship", "daily");
        LocalDate through = range.end().isAfter(today) ? today : range.end();
        var history = schedules.findByDateLessThanEqual(through).stream()
            .filter(s -> s.getRecurringId() != null && !s.isCancelled() && categories.contains(s.getCategory()))
            .sorted(Comparator.comparing(Schedule::getDate)).toList();
        Map<String, Integer> totals = new HashMap<>(), done = new HashMap<>();
        List<CompletionPoint> points = new ArrayList<>();
        int cursor = 0;
        for (LocalDate date = range.start(); !date.isAfter(range.end());
            date = "year".equals(period) ? date.plusMonths(1) : date.plusDays(1)) {
            LocalDate cutoff = "year".equals(period) ? date.with(TemporalAdjusters.lastDayOfMonth()) : date;
            if (cutoff.isAfter(today)) cutoff = today;
            boolean forecast = date.isAfter(today);
            Map<String, Integer> rates = new LinkedHashMap<>();
            if (!forecast) {
                while (cursor < history.size() && !history.get(cursor).getDate().isAfter(cutoff)) {
                    Schedule item = history.get(cursor++);
                    totals.merge(item.getCategory(), 1, Integer::sum);
                    if (item.isCompleted()) done.merge(item.getCategory(), 1, Integer::sum);
                }
            }
            for (String key : categories) {
                int total = totals.getOrDefault(key, 0);
                rates.put(key, forecast || total == 0 ? null :
                    (int) Math.round(100.0 * done.getOrDefault(key, 0) / total));
            }
            points.add(new CompletionPoint(date.toString(), rates, forecast));
        }
        int total = history.size();
        int completed = (int) history.stream().filter(Schedule::isCompleted).count();
        return new CompletionChart(range.start().toString(), range.end().toString(), points,
            total, completed, total == 0 ? null : (int) Math.round(100.0 * completed / total),
            "카테고리별 누적 완료율(%) = 해당 날짜까지 완료한 관리 일정 ÷ 해당 날짜까지 도래한 관리 일정 × 100. " +
            "조회 기간 이전의 기록도 포함하며, 취소·미래 일정과 일반 일정은 제외합니다. 기록이 없으면 선을 표시하지 않습니다.");
    }

    public record Range(LocalDate start, LocalDate end) {}

    public record Point(
        String date,
        Double score,
        int schedules,
        int completed,
        Integer rating,
        int positive,
        int negative,
        boolean forecast
    ) {}

    public record Evidence(String date, String excerpt, int positive, int negative) {}

    public record Summary(
        String period,
        String start,
        String end,
        List<Point> points,
        Double average,
        int scheduleCount,
        int completedCount,
        Integer completionRate,
        int diaryCount,
        Double ratingAverage,
        int positive,
        int negative,
        int previousSchedules,
        int previousNegative,
        String concentration,
        List<Evidence> evidence,
        String method,
        String briefing
    ) {}

    public Range range(String period, LocalDate anchor) {
        if (anchor.getYear() < 2000 || anchor.getYear() > 2100) throw new ResponseStatusException(
            HttpStatus.BAD_REQUEST,
            "2001~2100년을 선택해주세요."
        );
        LocalDate start = switch (period) {
            case "week" -> anchor.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));
            case "month" -> anchor.withDayOfMonth(1);
            case "year" -> anchor.withDayOfYear(1);
            default -> throw new ResponseStatusException(
                HttpStatus.BAD_REQUEST,
                "week, month, year 중 선택해주세요."
            );
        };
        return new Range(
            start,
            switch (period) {
                case "week" -> start.plusDays(6);
                case "month" -> start.plusMonths(1).minusDays(1);
                default -> start.plusYears(1).minusDays(1);
            }
        );
    }

    private List<Schedule> scheduleRange(LocalDate start, LocalDate end) {
        recurring.ensure(start, end);
        return schedules
            .findByDateBetween(start, end)
            .stream()
            .filter(s -> !s.isCancelled())
            .toList();
    }

    public static int matches(String text, List<String> words) {
        if (text == null) return 0;
        int count = 0;
        for (String sentence : text.split("[.!?。\\n]")) {
            for (String word : words) if (sentence.contains(word)) count++;
        }
        return count;
    }

    private String entryText(DiarySignalSource.Entry d) {
        return Objects.toString(d.text, "") + "\n" + Objects.toString(d.timetable, "");
    }

    private int positive(DiarySignalSource.Entry d) {
        return matches(entryText(d), POSITIVE);
    }

    private int negative(DiarySignalSource.Entry d) {
        return matches(entryText(d), NEGATIVE);
    }

    public static Double score(int count, Integer rating, int positive, int negative, boolean hasDiary) {
        if (count == 0 && !hasDiary) return null;
        double sum = Math.min(100, (count * 100.0) / 6) * .4,
            weight = .4;
        if (positive + negative > 0) {
            sum += ((100.0 * negative) / (positive + negative)) * .35;
            weight += .35;
        }
        if (rating != null) {
            sum += (5 - rating) * 25 * .25;
            weight += .25;
        }
        return Math.round((sum / weight) * 10.0) / 10.0;
    }

    public Summary summary(String period, LocalDate anchor) {
        Range range = range(period, anchor);
        List<Schedule> events = scheduleRange(range.start, range.end);
        List<DiarySignalSource.Entry> entries = diaries.findByDateBetweenOrderByDateAsc(
            range.start,
            range.end
        );
        LocalDate previous = switch (period) {
            case "week" -> range.start.minusWeeks(1);
            case "month" -> range.start.minusMonths(1);
            default -> range.start.minusYears(1);
        };
        Range prior = range(period, previous);
        List<Schedule> before = scheduleRange(prior.start, prior.end);
        List<DiarySignalSource.Entry> priorEntries = diaries.findByDateBetweenOrderByDateAsc(
            prior.start,
            prior.end
        );
        List<Point> daily = new ArrayList<>();
        for (LocalDate date = range.start; !date.isAfter(range.end); date = date.plusDays(1)) {
            LocalDate day = date;
            List<Schedule> items = events
                .stream()
                .filter(s -> s.getDate().equals(day))
                .toList();
            DiarySignalSource.Entry diary = entries
                .stream()
                .filter(d -> d.date.equals(day))
                .findFirst()
                .orElse(null);
            int pos = diary == null ? 0 : positive(diary),
                neg = diary == null ? 0 : negative(diary);
            Integer rating = diary == null ? null : diary.rating;
            daily.add(
                new Point(
                    day.toString(),
                    score(items.size(), rating, pos, neg, diary != null),
                    items.size(),
                    (int) items.stream().filter(Schedule::isCompleted).count(),
                    rating,
                    pos,
                    neg,
                    day.isAfter(LocalDate.now())
                )
            );
        }
        List<Point> points = daily;
        if (period.equals("year")) {
            points = new ArrayList<>();
            for (int month = 1; month <= 12; month++) {
                int m = month;
                List<Point> days = daily
                    .stream()
                    .filter(p -> LocalDate.parse(p.date).getMonthValue() == m)
                    .toList();
                points.add(
                    new Point(
                        range.start.withMonth(m).toString(),
                        average(days),
                        days.stream().mapToInt(Point::schedules).sum(),
                        days.stream().mapToInt(Point::completed).sum(),
                        null,
                        days.stream().mapToInt(Point::positive).sum(),
                        days.stream().mapToInt(Point::negative).sum(),
                        range.start.withMonth(m).isAfter(LocalDate.now())
                    )
                );
            }
        }
        List<Schedule> due = events
            .stream()
            .filter(s -> !s.getDate().isAfter(LocalDate.now()))
            .toList();
        int completed = (int) due.stream().filter(Schedule::isCompleted).count();
        Integer rate = due.isEmpty() ? null : (int) Math.round((completed * 100.0) / due.size());
        var ratings = entries
            .stream()
            .filter(d -> d.rating != null)
            .mapToInt(d -> d.rating)
            .average();
        int positive = entries.stream().mapToInt(this::positive).sum(),
            negative = entries.stream().mapToInt(this::negative).sum();
        int peak = daily.stream().mapToInt(Point::schedules).max().orElse(0);
        String concentration =
            peak == 0
                ? "등록된 일정 없음"
                : daily
                      .stream()
                      .filter(p -> p.schedules == peak)
                      .limit(5)
                      .map(p -> p.date + " (" + p.schedules + "건)")
                      .reduce((a, b) -> a + ", " + b)
                      .orElse("");
        String briefing = completionBriefing(period, anchor).briefing();
        List<Evidence> evidence = entries
            .stream()
            .filter(d -> positive(d) + negative(d) > 0)
            .limit(8)
            .map(d -> {
                String snippet = Arrays.stream(entryText(d).split("[.!?。\\n]"))
                    .filter(t -> matches(t, POSITIVE) + matches(t, NEGATIVE) > 0)
                    .findFirst()
                    .orElse("");
                return new Evidence(
                    d.date.toString(),
                    snippet.substring(0, Math.min(snippet.length(), 120)),
                    positive(d),
                    negative(d)
                );
            })
            .toList();
        return new Summary(
            period,
            range.start.toString(),
            range.end.toString(),
            points,
            average(daily),
            events.size(),
            completed,
            rate,
            entries.size(),
            ratings.isPresent() ? Math.round(ratings.getAsDouble() * 10.0) / 10.0 : null,
            positive,
            negative,
            before.size(),
            priorEntries.stream().mapToInt(this::negative).sum(),
            concentration,
            evidence,
            METHOD,
            briefing
        );
    }

    private Double average(List<Point> points) {
        var avg = points
            .stream()
            .filter(p -> p.score != null)
            .mapToDouble(p -> p.score)
            .average();
        return avg.isPresent() ? Math.round(avg.getAsDouble() * 10.0) / 10.0 : null;
    }

    public record CompletionBriefing(int total, int completed, Integer rate, String briefing, String facts) {}

    public CompletionBriefing completionBriefing(String period, LocalDate anchor) {
        Range range = range(period, anchor);
        LocalDate today = LocalDate.now();
        Map<String, String> categories = new LinkedHashMap<>();
        categories.put("health", "건강"); categories.put("subscription", "구독");
        categories.put("relationship", "교체"); categories.put("daily", "일상");
        var events = scheduleRange(range.start(), range.end()).stream()
            .filter(event -> event.getRecurringId() != null && !event.getDate().isAfter(today)
                && categories.containsKey(event.getCategory())).toList();
        int total = events.size();
        int completed = (int) events.stream().filter(Schedule::isCompleted).count();
        Integer rate = total == 0 ? null : (int) Math.round(100.0 * completed / total);
        String encouragement = total == 0
            ? "완료 기록이 쌓이면 관리 상태를 확인할 수 있어요. 작은 관리 일정부터 시작해보세요."
            : rate >= 80 ? "꾸준히 관리하고 있어요. 지금의 좋은 흐름을 이어가세요!"
            : rate >= 50 ? "하나씩 관리해 나가고 있어요. 남은 일정 중 한 가지를 골라 마무리해보세요."
            : completed > 0 ? "완료한 일정이 좋은 시작이에요. 다음에 실천할 한 가지를 정해보세요."
            : "아직 완료 기록이 없어요. 부담이 작은 일정 한 가지부터 시작해보세요.";
        String briefing = total == 0
            ? "이 기간에 도래한 관리 일정이 없어 완료율을 평가할 수 없어요. " + encouragement
            : "이 기간에 도래한 관리 일정 " + total + "건 중 " + completed + "건을 완료했어요(완료율 " + rate + "%). " + encouragement;
        StringBuilder facts = new StringBuilder("관리 완료 기록 기준 v2\n기간: ")
            .append(range.start()).append(" ~ ").append(range.end())
            .append("\n관리 대상: 도래한 일정 ").append(total).append("건, 완료 ")
            .append(completed).append("건, 미완료 ").append(total - completed)
            .append("건, 완료율 ").append(rate == null ? "평가할 기록 없음" : rate + "%")
            .append("\n취소·미래 일정과 일반 달력 일정은 제외합니다.");
        categories.forEach((key, label) -> {
            var categoryEvents = events.stream().filter(event -> key.equals(event.getCategory())).toList();
            long done = categoryEvents.stream().filter(Schedule::isCompleted).count();
            facts.append("\n").append(label).append(": 도래 ").append(categoryEvents.size())
                .append("건, 완료 ").append(done).append("건, 완료율 ")
                .append(categoryEvents.isEmpty() ? "평가할 기록 없음" : Math.round(100.0 * done / categoryEvents.size()) + "%");
        });
        return new CompletionBriefing(total, completed, rate, briefing, facts.toString());
    }

    public synchronized ManagementReport report(String period, LocalDate anchor, boolean retry) {
        Range range = range(period, anchor);
        CompletionBriefing summary = completionBriefing(period, anchor);
        String facts = summary.facts();
        String raw = scheduleRange(range.start(), range.end()).stream()
            .filter(event -> event.getRecurringId() != null)
            .map(event -> event.getId() + ":" + event.getTitle() + ":" + event.getCategory() + ":" + event.getDate() + ":" + event.isCompleted())
            .sorted().reduce("", (left, right) -> left + "\n" + right);
        String hash;
        try {
            hash = HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                .digest((facts + raw).getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) { throw new IllegalStateException(e); }
        String id = period + "-" + range.start();
        ManagementReport report = reports.findById(id).orElseGet(ManagementReport::new);
        if (hash.equals(report.fingerprint) && (!retry || "AI".equals(report.source))) return report;
        String narrative = summary.total() == 0 ? null : ai.narrate(facts);
        report.id = id;
        report.period = period;
        report.startDate = range.start().toString();
        report.endDate = range.end().toString();
        report.fingerprint = hash;
        report.source = narrative == null ? "BASIC" : "AI";
        report.content = (narrative == null ? summary.briefing() : narrative) + "\n\n[산출 근거]\n" + facts;
        report.briefing = narrative == null ? summary.briefing() : narrative.lines()
            .filter(line -> !line.isBlank()).findFirst().orElse(summary.briefing());
        report.briefing = report.briefing.substring(0, Math.min(report.briefing.length(), 1000));
        report.generatedAt = LocalDateTime.now().toString();
        return reports.save(report);
    }
}
