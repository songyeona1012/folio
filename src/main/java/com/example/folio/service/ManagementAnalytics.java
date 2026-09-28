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
        double congestion = (events.size() * 1.0) / daily.size();
        String level = congestion < 2 ? "여유" : congestion < 4 ? "보통" : "바쁨";
        String briefing = "이 기간의 하루 평균 일정은 %.1f건, 혼잡도는 ‘%s’입니다. %s".formatted(
            congestion,
            level,
            level.equals("바쁨") ? "하루 이상 휴식 시간을 확보해보세요." : "일정 사이에 여유를 이어가보세요."
        );
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

    public synchronized ManagementReport report(String period, LocalDate anchor, boolean retry) {
        Summary s = summary(period, anchor);
        String facts =
            "일기·별점 연동 전: 일기 내용과 감정에 대한 추론을 하지 마세요. 일정 기반 분석만 가능합니다.\n기간: " +
            s.start +
            " ~ " +
            s.end +
            "\n" +
            s.briefing +
            "\n일정 " +
            s.scheduleCount +
            "건, 이전 기간 " +
            s.previousSchedules +
            "건. " +
            (s.previousSchedules == 0
                ? "이전 일정이 없어 증감률 계산 불가."
                : "일정 증감률 " +
                  Math.round(((s.scheduleCount - s.previousSchedules) * 100.0) / s.previousSchedules) +
                  "%.") +
            "\n오늘까지 완료 " +
            s.completedCount +
            "건, 달성률 " +
            (s.completionRate == null ? "자료 없음" : s.completionRate + "%") +
            "\n집중 날짜: " +
            s.concentration +
            "\n일기 " +
            s.diaryCount +
            "일, 별점 평균 " +
            s.ratingAverage +
            ", 긍정 표현 " +
            s.positive +
            ", 부정 표현 " +
            s.negative +
            ", 이전 기간 부정 표현 " +
            s.previousNegative +
            "\n압박감 평균 " +
            (s.average == null ? "자료 없음" : s.average + " / 100") +
            "\n" +
            METHOD;
        for (Schedule event : scheduleRange(LocalDate.parse(s.start), LocalDate.parse(s.end))
            .stream()
            .limit(30)
            .toList())
            facts +=
                "\n일정: " +
                event.getDate() +
                " " +
                event.getTitle() +
                " (" +
                (event.isCompleted() ? "완료" : "미완료") +
                ")";
        for (Evidence e : s.evidence) facts += "\n일기 근거 [" + e.date + "]: “" + e.excerpt + "”";
        // Include full records in the hash: editing a title or completion must invalidate the report.
        String raw =
            scheduleRange(LocalDate.parse(s.start), LocalDate.parse(s.end))
                .stream()
                .map(e -> e.getId() + ":" + e.getTitle() + ":" + e.getDate() + ":" + e.isCompleted())
                .sorted()
                .reduce("", (a, b) -> a + b) +
            diaries
                .findByDateBetweenOrderByDateAsc(LocalDate.parse(s.start), LocalDate.parse(s.end))
                .stream()
                .map(d -> d.date + entryText(d) + d.rating)
                .reduce("", (a, b) -> a + b);
        String hash;
        try {
            hash = HexFormat.of().formatHex(
                MessageDigest.getInstance("SHA-256").digest((facts + raw).getBytes(StandardCharsets.UTF_8))
            );
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
        String id = period + "-" + s.start;
        ManagementReport r = reports.findById(id).orElseGet(ManagementReport::new);
        if (hash.equals(r.fingerprint) && (!retry || "AI".equals(r.source))) return r;
        String narrative =
            s.scheduleCount == 0 && s.diaryCount == 0
                ? null
                : ai.narrate(
                      (period.equals("week")
                          ? "첫 문장은 이번 주 일정 혼잡도 평균과 짧은 제안을 담은 브리핑으로 작성하세요.\n"
                          : "") + facts
                  );
        r.id = id;
        r.period = period;
        r.startDate = s.start;
        r.endDate = s.end;
        r.fingerprint = hash;
        r.source = narrative == null ? "BASIC" : "AI";
        r.content =
            narrative == null
                ? facts +
                  "\n\n" +
                  (s.scheduleCount == 0 && s.diaryCount == 0
                      ? "기록을 추가하면 분석을 시작할 수 있어요."
                      : "다음 주에는 하루 이상 휴식 시간을 확보해보세요.")
                : narrative + "\n\n[산출 근거]\n" + facts;
        r.briefing =
            narrative == null
                ? s.briefing
                : narrative
                      .lines()
                      .filter(line -> !line.isBlank())
                      .findFirst()
                      .orElse(s.briefing);
        r.briefing = r.briefing.substring(0, Math.min(r.briefing.length(), 1000));
        r.generatedAt = LocalDateTime.now().toString();
        return reports.save(r);
    }
}
