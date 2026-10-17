// 관리 기록의 누적 완료율·혼잡도·기간별 기록지를 계산합니다.
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

    public record CompletionChart(
        String start,
        String end,
        List<CompletionPoint> points,
        int scheduleCount,
        int completedCount,
        Integer completionRate,
        String method
    ) {}

    // 월간은 월별, 연간은 연도별로 누적 완료율을 집계합니다.
    public CompletionChart completionChart(String period, LocalDate anchor) {
        Range range = range(period, anchor);
        LocalDate today = LocalDate.now();
        LocalDate reference = anchor.isAfter(today) ? today : anchor;
        if (!"week".equals(period)) range = new Range(reference.withDayOfYear(1), reference);
        List<String> categories = List.of("health", "subscription", "relationship", "daily");
        LocalDate through = range.end().isAfter(today) ? today : range.end();
        recurring.ensureHistory(through);
        var history = schedules
            .findByDateLessThanEqual(through)
            .stream()
            .filter(
                s -> s.getRecurringId() != null && !s.isCancelled() && categories.contains(s.getCategory())
            )
            .sorted(Comparator.comparing(Schedule::getDate))
            .toList();
        if ("year".equals(period)) {
            LocalDate first = history.isEmpty() ? reference : history.getFirst().getDate();
            range = new Range(first.withDayOfYear(1), reference);
        }
        Map<String, Integer> totals = new HashMap<>(),
            done = new HashMap<>();
        List<CompletionPoint> points = new ArrayList<>();
        int cursor = 0;
        for (
            LocalDate date = range.start();
            !date.isAfter(range.end());
            date = "year".equals(period) ? date.plusYears(1) : "month".equals(period) ? date.plusMonths(1) : date.plusDays(1)
        ) {
            LocalDate cutoff = switch (period) {
                case "year" -> date.with(TemporalAdjusters.lastDayOfYear());
                case "month" -> date.with(TemporalAdjusters.lastDayOfMonth());
                default -> date;
            };
            if (cutoff.isAfter(through)) cutoff = through;
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
                rates.put(
                    key,
                    forecast || total == 0
                        ? null
                        : (int) Math.round((100.0 * done.getOrDefault(key, 0)) / total)
                );
            }
            points.add(new CompletionPoint(date.toString(), rates, forecast));
        }
        int total = history.size();
        int completed = (int) history.stream().filter(Schedule::isCompleted).count();
        return new CompletionChart(
            range.start().toString(),
            range.end().toString(),
            points,
            total,
            completed,
            total == 0 ? null : (int) Math.round((100.0 * completed) / total),
            "카테고리별 누적 완료율(%) = 해당 날짜까지 완료한 관리 일정 ÷ 해당 날짜까지 예정된 관리 일정 × 100. " +
                "조회 기간 이전의 기록도 포함하며, 취소·미래 일정과 일반 일정은 제외합니다. 기록이 없으면 선을 표시하지 않습니다."
        );
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

    // 기간별 요약·기록지에 사용하는 시작일과 종료일을 정합니다.
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
        LocalDate reference = anchor.isAfter(today) ? today : anchor;
        if (!"week".equals(period)) range = new Range(reference.withDayOfYear(1), reference);
        Map<String, String> categories = new LinkedHashMap<>();
        categories.put("health", "건강");
        categories.put("subscription", "구독");
        categories.put("relationship", "교체");
        categories.put("daily", "일상");
        var events = scheduleRange(range.start(), range.end())
            .stream()
            .filter(
                event ->
                    event.getRecurringId() != null &&
                    !event.getDate().isAfter(today) &&
                    categories.containsKey(event.getCategory())
            )
            .toList();
        int total = events.size();
        int completed = (int) events.stream().filter(Schedule::isCompleted).count();
        Integer rate = total == 0 ? null : (int) Math.round((100.0 * completed) / total);
        String encouragement =
            total == 0
                ? "완료 기록이 쌓이면 관리 상태를 확인할 수 있어요. 작은 관리 일정부터 시작해보세요."
                : rate >= 80
                  ? "꾸준히 관리하고 있어요. 지금의 좋은 흐름을 이어가세요!"
                  : rate >= 50
                    ? "하나씩 관리해 나가고 있어요. 남은 일정 중 한 가지를 골라 마무리해보세요."
                    : completed > 0
                      ? "완료한 일정이 좋은 시작이에요. 다음에 실천할 한 가지를 정해보세요."
                      : "아직 완료 기록이 없어요. 부담이 작은 일정 한 가지부터 시작해보세요.";
        String briefing =
            total == 0
                ? "이 기간에 예정된 관리 일정이 없어 완료율을 평가할 수 없어요. " + encouragement
                : "이 기간에 예정된 관리 일정 " +
                  total +
                  "건 중 " +
                  completed +
                  "건을 완료했어요(완료율 " +
                  rate +
                  "%). " +
                  encouragement;
        // AI를 사용할 수 없어도 카테고리 차이와 다음 실천을 연결해 설명합니다.
        StringBuilder detailed = new StringBuilder();
        if (total == 0) {
            detailed.append(briefing).append(" 기록이 쌓이면 잘 이어가는 부분과 놓치기 쉬운 시기를 함께 살펴볼게요.");
        } else {
            String strongest = null;
            String weakest = null;
            double highest = -1;
            double lowest = 101;
            for (var category : categories.entrySet()) {
                var items = events.stream().filter(event -> category.getKey().equals(event.getCategory())).toList();
                if (items.isEmpty()) continue;
                double percent = 100.0 * items.stream().filter(Schedule::isCompleted).count() / items.size();
                if (percent > highest) {
                    highest = percent;
                    strongest = category.getKey();
                }
                if (percent < lowest) {
                    lowest = percent;
                    weakest = category.getKey();
                }
            }
            if (highest > lowest) {
                detailed.append("이번 기록에서는 ").append(categories.get(strongest))
                    .append(" 관리가 비교적 잘 이어진 반면, ").append(categories.get(weakest))
                    .append(" 관리에는 아직 놓친 항목이 보여요. 같은 기간에도 관리 종류에 따라 실천 흐름이 다르게 나타났습니다.");
            } else if (rate >= 80) {
                detailed.append("이번 기간에는 예정된 관리를 전반적으로 잘 챙겼어요. 완료율은 ")
                    .append(rate).append("%로, 좋은 흐름을 이어가고 있습니다.");
            } else {
                detailed.append("이번 기간에는 완료율이 ").append(rate)
                    .append("%로 나타났어요. 아직 마무리하지 않은 일이 남아 있지만, 한꺼번에 따라잡으려 하기보다는 다음에 챙길 일을 정해보면 좋겠습니다.");
            }
            if (lowest < 80 && weakest != null) {
                detailed.append("\n\n");
                switch (weakest) {
                    case "relationship" -> detailed.append("교체 관리는 주기가 길어 평소에는 잊기 쉬울 수 있어요. 교체할 물품을 미리 준비하고 예정일 전에 알림을 설정해보세요. 반복해서 떠올려야 하는 부담을 줄이면 다음 일정부터 조금 더 수월하게 이어갈 수 있습니다.");
                    case "daily" -> detailed.append("일상 관리는 작은 일을 반복해야 해서 꾸준히 이어가는 장치가 필요해요. 식사 후나 잠들기 전처럼 이미 하고 있는 행동에 한 가지를 붙여보세요. 부담이 작은 목표부터 정해 다음 주기에는 한 번 더 실천해보면 좋겠습니다.");
                    case "health" -> detailed.append("건강 관리에서 아직 마무리하지 않은 항목을 먼저 확인해보세요. 예약이 필요한 일정이라면 가능한 날짜를 정하고, 준비할 일을 미리 적어두면 다음 주기를 챙기는 데 도움이 됩니다.");
                    default -> detailed.append("구독 관리는 결제일이나 갱신일 전에 알림을 두고, 계속 이용할 서비스인지 확인하는 시간을 정해보세요. 놓친 항목을 모두 한 번에 해결하기보다 가장 가까운 일정부터 챙겨보면 좋겠습니다.");
                }
            }
            if (highest >= 80 && strongest != null) {
                detailed.append("\n\n그래도 ").append(categories.get(strongest)).append(" 관리는 완료율 ")
                    .append(Math.round(highest)).append("%로 잘 챙겼다는 점이 반가워요. 이때 도움이 됐던 알림이나 확인 습관을 다른 관리에도 활용해보세요. 이미 이어가고 있는 좋은 흐름이 다음 실천의 출발점이 될 수 있습니다.");
            }
            detailed.append("\n\n다음 기간에는 가장 자주 놓치는 관리 한 가지를 골라, 예정일에 맞춰 한 번 더 챙겨보세요. 실제로 마친 일은 완료 표시까지 남기면 다음 기록에서 달라진 흐름을 더 정확히 확인할 수 있어요.");
        }
        briefing = detailed.toString();
        StringBuilder facts = new StringBuilder("관리 일정 완료 기록\n기간: ")
            .append(range.start())
            .append(" ~ ")
            .append(range.end())
            .append("\n관리 대상: 예정된 일정 ")
            .append(total)
            .append("건, 완료 ")
            .append(completed)
            .append("건, 미완료 ")
            .append(total - completed)
            .append("건, 완료율 ")
            .append(rate == null ? "평가할 기록 없음" : rate + "%")
            .append("\n취소·미래 일정과 일반 달력 일정은 제외합니다.");
        categories.forEach((key, label) -> {
            var categoryEvents = events
                .stream()
                .filter(event -> key.equals(event.getCategory()))
                .toList();
            long done = categoryEvents.stream().filter(Schedule::isCompleted).count();
            facts
                .append("\n")
                .append(label)
                .append(": 일정 ")
                .append(categoryEvents.size())
                .append("건, 완료 ")
                .append(done)
                .append("건, 완료율 ")
                .append(
                    categoryEvents.isEmpty()
                        ? "평가할 기록 없음"
                        : Math.round((100.0 * done) / categoryEvents.size()) + "%"
                );
        });
        var allPeriodEvents = scheduleRange(range.start(), range.end())
            .stream()
            .filter(event -> !event.getDate().isAfter(today))
            .toList();
        facts.append("\n월별 변화 (미래 일정 제외, 완료율 차이는 %포인트, 혼잡도는 하루 평균 일정 수 기준):");
        for (
            LocalDate month = range.start().withDayOfMonth(1);
            !month.isAfter(range.end()) && !month.isAfter(today);
            month = month.plusMonths(1)
        ) {
            LocalDate from = month.isBefore(range.start()) ? range.start() : month;
            LocalDate until = month.with(TemporalAdjusters.lastDayOfMonth());
            if (until.isAfter(range.end())) until = range.end();
            if (until.isAfter(today)) until = today;
            final LocalDate last = until;
            var monthEvents = allPeriodEvents
                .stream()
                .filter(event -> !event.getDate().isBefore(from) && !event.getDate().isAfter(last))
                .toList();
            long days = java.time.temporal.ChronoUnit.DAYS.between(from, last) + 1;
            facts
                .append("\n")
                .append(month.getYear())
                .append("년 ")
                .append(month.getMonthValue())
                .append("월: 전체 일정 ")
                .append(monthEvents.size())
                .append("건, 하루 평균 ")
                .append(Math.round((10.0 * monthEvents.size()) / days) / 10.0)
                .append("건");
            categories.forEach((key, label) -> {
                var items = monthEvents
                    .stream()
                    .filter(event -> event.getRecurringId() != null && key.equals(event.getCategory()))
                    .toList();
                long done = items.stream().filter(Schedule::isCompleted).count();
                facts
                    .append("; ")
                    .append(label)
                    .append(" 예정 ")
                    .append(items.size())
                    .append("건, 완료 ")
                    .append(done)
                    .append("건, 완료율 ")
                    .append(items.isEmpty() ? "기록 없음" : Math.round((100.0 * done) / items.size()) + "%");
            });
        }
        StringBuilder changes = new StringBuilder();
        for (var category : categories.entrySet()) {
            Double previousRate = null;
            Double previousLoad = null;
            java.time.YearMonth previousMonth = null;
            double biggestDrop = 0;
            String decline = null;
            for (
                LocalDate month = range.start().withDayOfMonth(1);
                !month.isAfter(range.end()) && !month.isAfter(today);
                month = month.plusMonths(1)
            ) {
                final java.time.YearMonth ym = java.time.YearMonth.from(month);
                var monthItems = events
                    .stream()
                    .filter(
                        event ->
                            category.getKey().equals(event.getCategory()) &&
                            java.time.YearMonth.from(event.getDate()).equals(ym)
                    )
                    .toList();
                if (monthItems.isEmpty()) continue;
                double currentRate =
                    (100.0 * monthItems.stream().filter(Schedule::isCompleted).count()) / monthItems.size();
                long monthCount = allPeriodEvents
                    .stream()
                    .filter(event -> java.time.YearMonth.from(event.getDate()).equals(ym))
                    .count();
                LocalDate monthEnd = month.with(TemporalAdjusters.lastDayOfMonth());
                if (monthEnd.isAfter(today)) monthEnd = today;
                if (monthEnd.isAfter(range.end())) monthEnd = range.end();
                LocalDate monthStart = month.isBefore(range.start()) ? range.start() : month;
                double load =
                    (double) monthCount /
                    (java.time.temporal.ChronoUnit.DAYS.between(monthStart, monthEnd) + 1);
                if (previousRate != null && previousRate - currentRate > biggestDrop) {
                    biggestDrop = previousRate - currentRate;
                    decline =
                        category.getValue() +
                        " 관리는 " +
                        previousMonth.getMonthValue() +
                        "월의 완료율 " +
                        Math.round(previousRate) +
                        "%에서 " +
                        ym.getMonthValue() +
                        "월 " +
                        Math.round(currentRate) +
                        "%로, " +
                        Math.round(biggestDrop * 10) / 10.0 +
                        "%포인트 낮아졌어요. " +
                        (load > previousLoad
                            ? "같은 시기에 하루 평균 일정 수도 늘어났어요. 일정이 많았던 점과 관련이 있을 수 있지만, 이것만으로 이유를 단정할 수는 없어요. "
                            : "완료하지 못한 항목을 확인해 다음에 챙길 일을 한 가지 정해보세요. ") +
                        (category.getKey().equals("relationship")
                            ? "교체할 물품을 미리 준비하고 예정일 전날 알림을 설정해보세요."
                            : category.getKey().equals("daily")
                              ? "일상 관리는 식사나 잠들기 전처럼 이미 하는 행동에 붙여보면 반복하기 쉬워져요."
                              : "다음 일정의 날짜를 확인하고 필요한 예약이나 준비를 미리 해두면 도움이 돼요.");
                }
                previousRate = currentRate;
                previousLoad = load;
                previousMonth = ym;
            }
            if (decline != null) changes.append(decline).append("\n\n");
        }
        if (!changes.isEmpty()) {
            briefing = changes + briefing;
            facts.append("\n눈에 띄는 월별 변화:\n").append(changes);
        }
        return new CompletionBriefing(total, completed, rate, briefing, facts.toString());
    }

    public synchronized ManagementReport report(String period, LocalDate anchor, boolean retry) {
        Range range = range(period, anchor);
        CompletionBriefing summary = completionBriefing(period, anchor);
        String facts = "변화 분석 기록지 형식 v5\n" + summary.facts();
        String raw = scheduleRange(range.start(), range.end())
            .stream()
            .filter(event -> event.getRecurringId() != null)
            .map(
                event ->
                    event.getId() +
                    ":" +
                    event.getTitle() +
                    ":" +
                    event.getCategory() +
                    ":" +
                    event.getDate() +
                    ":" +
                    event.isCompleted()
            )
            .sorted()
            .reduce("", (left, right) -> left + "\n" + right);
        String hash;
        try {
            hash = HexFormat.of().formatHex(
                MessageDigest.getInstance("SHA-256").digest((facts + raw).getBytes(StandardCharsets.UTF_8))
            );
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
        String id = com.example.folio.security.OwnerContext.id() + "-" + period + "-" + range.start();
        ManagementReport report = reports.findById(id).orElseGet(ManagementReport::new);
        if (hash.equals(report.fingerprint) && (!retry || "AI".equals(report.source))) return report;
        String narrative = summary.total() == 0 ? null : ai.narrate(facts);
        report.id = id;
        report.period = period;
        report.startDate = range.start().toString();
        report.endDate = range.end().toString();
        report.fingerprint = hash;
        report.source = narrative == null ? "BASIC" : "AI";
        report.content =
            (narrative == null ? summary.briefing() : narrative) + "\n\n[완료 기록 자세히 보기]\n" + facts;
        report.briefing =
            narrative == null
                ? summary.briefing()
                : narrative
                      .lines()
                      .filter(line -> !line.isBlank())
                      .findFirst()
                      .orElse(summary.briefing());
        report.briefing = report.briefing.substring(0, Math.min(report.briefing.length(), 1000));
        report.generatedAt = LocalDateTime.now().toString();
        return reports.save(report);
    }
}
