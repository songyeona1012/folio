package com.example.folio.service;

import com.example.folio.dto.GoalAiFormRequest;
import com.example.folio.dto.GoalAiFormResponse;
import com.example.folio.dto.GoalAiMoneyRequest;
import com.example.folio.dto.GoalAiMoneyResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.List;
import java.util.Locale;

/**
 * 목표 화면의 AI 기능.
 *
 * 1) AI 자율 작성 양식: 말을 받아 양식을 만든다. 키가 없거나 AI 호출이 실패하면 기본 틀(GoalBasicFormBuilder)이 만든다.
 * 2) 금전 양식의 달성 현황: 화면의 규칙으로 읽지 못한 문장 한 줄만 AI가 읽는다. 키가 없으면 503으로 알린다.
 *
 * 어느 쪽이든 화면이 안전하게 쓸 수 있도록 길이/개수/날짜/금액을 서버에서 다시 다듬어서 돌려준다.
 * AI 사용량은 1분에 30번까지로 묶는다 (두 기능 합계).
 */
@Service
public class GoalAiService {

    private static final Logger log = LoggerFactory.getLogger(GoalAiService.class);

    private static final int PROMPT_MAX_LENGTH = 1000;
    private static final int HISTORY_MAX = 12;
    private static final int HISTORY_TEXT_MAX_LENGTH = 600;
    private static final int REPLY_MAX_LENGTH = 450;
    private static final int TITLE_MAX_LENGTH = 60;
    private static final int BLOCK_MAX = 10;
    private static final int BLOCK_TITLE_MAX_LENGTH = 40;
    private static final int FIELD_MAX = 12;
    private static final int FIELD_LABEL_MAX_LENGTH = 30;
    private static final int FIELD_VALUE_MAX_LENGTH = 255;
    private static final int ITEM_MAX = 30;
    private static final int ITEM_TEXT_MAX_LENGTH = 100;
    private static final int TRACKER_COLUMN_MAX = 14;
    private static final int TRACKER_ROW_MAX = 10;
    private static final int COLUMN_NAME_MAX_LENGTH = 12;
    private static final int LOG_COLUMN_MAX = 5;
    private static final int LOG_ROW_MAX = 60;
    private static final int LOG_CELL_MAX_LENGTH = 100;
    private static final int UNIT_MAX_LENGTH = 10;
    private static final int NOTE_MAX_LENGTH = 1000;
    private static final double NUMBER_LIMIT = 1_000_000_000d;

    private static final int MONEY_TEXT_MAX_LENGTH = 300;
    private static final int MONEY_MESSAGE_MAX_LENGTH = 80;
    private static final int CYCLE_MAX_LENGTH = 30;
    private static final long TARGET_MIN = 10_000L;          // 목표 금액은 최소 1만원
    private static final long AMOUNT_LIMIT = 10_000_000_000L; // 100억원 미만

    /** AI 사용량을 지키는 제한: 1분에 이만큼까지만 (서버 전체 합계) */
    private static final int CALLS_PER_MINUTE = 30;
    private static final long WINDOW_MILLIS = 60_000L;

    private final GoalAiClient ai;
    private final GoalBasicFormBuilder basic;
    private final Deque<Long> recentCalls = new ArrayDeque<>();

    public GoalAiService(GoalAiClient ai, GoalBasicFormBuilder basic) {
        this.ai = ai;
        this.basic = basic;
    }

    /* ---------- AI 자율 작성 양식 ---------- */

    public GoalAiFormResponse buildForm(GoalAiFormRequest request) {
        if (request == null || !StringUtils.hasText(request.prompt())) {
            throw new IllegalArgumentException("어떤 목표인지 먼저 적어 주세요.");
        }
        if (request.prompt().trim().length() > PROMPT_MAX_LENGTH) {
            throw new IllegalArgumentException("한 번에 " + PROMPT_MAX_LENGTH + "자까지 보낼 수 있어요.");
        }

        // AI에 보내기 전에 줄인다: 대화는 최근 몇 개만, 지금 양식도 같은 길이 제한으로 (토큰 절약)
        List<GoalAiFormRequest.Message> history = request.history() == null ? List.of()
            : request.history().stream()
            .filter(item -> item != null && item.text() != null)
            .map(item -> new GoalAiFormRequest.Message(item.role(), cut(item.text(), HISTORY_TEXT_MAX_LENGTH)))
            .toList();
        GoalAiFormRequest cleaned = new GoalAiFormRequest(
            request.prompt().trim(),
            history.subList(Math.max(0, history.size() - HISTORY_MAX), history.size()),
            cleanCurrent(request.current()));
        LocalDate today = LocalDate.now();

        if (!ai.isConfigured()) {
            return sanitize(basic.build(cleaned, today, null));
        }

        checkRate();
        try {
            return sanitize(ai.generateForm(cleaned, today));
        } catch (Exception e) {
            log.warn("AI로 양식을 만들지 못해 기본 틀로 대신합니다: {}", e.toString());
            return sanitize(basic.build(cleaned, today, "인공지능과 연결이 원활하지 않아 기본 틀로 만들었어요. (" + reasonOf(e) + ")"));
        }
    }

    /* ---------- 금전 양식: 달성 현황에 고쳐 쓴 문장 읽기 ---------- */

    public GoalAiMoneyResponse readMoneyEdit(GoalAiMoneyRequest request) {
        if (request == null || !StringUtils.hasText(request.text())) {
            throw new IllegalArgumentException("읽을 문장이 없어요.");
        }
        if (!ai.isConfigured()) {
            // 화면이 이 상태 코드를 보고 "서버에 키가 필요해요"라고 안내한다 (팀 AiService.parseSchedule과 같은 방식)
            throw new GoalAiException(HttpStatus.SERVICE_UNAVAILABLE,
                "AI 기능을 사용하려면 GEMINI_API_KEY, ANTHROPIC_API_KEY, OPENAI_API_KEY 중 하나를 환경변수로 설정해주세요.");
        }

        GoalAiMoneyRequest.Current current = request.current() == null ? null : new GoalAiMoneyRequest.Current(
            validDate(request.current().startDate()),
            validDate(request.current().endDate()),
            amountOrNull(request.current().targetAmount(), 0),
            amountOrNull(request.current().startAmount(), 0),
            amountOrNull(request.current().depositAmount(), 0),
            cut(request.current().depositCycle(), CYCLE_MAX_LENGTH));
        GoalAiMoneyRequest cleaned = new GoalAiMoneyRequest(cut(request.text(), MONEY_TEXT_MAX_LENGTH), current);

        checkRate();
        try {
            return sanitizeMoney(ai.readMoneyEdit(cleaned, LocalDate.now()), current);
        } catch (Exception e) {
            log.warn("AI가 달성 현황 문장을 읽지 못했어요: {}", e.toString());
            throw new GoalAiException(HttpStatus.BAD_GATEWAY, "AI 응답을 읽지 못했어요.");
        }
    }

    /** 화면에 보여줄 짧은 실패 이유. 우리가 만든 문구(응답 코드 등)만 그대로 보이고, 키나 요청 내용은 들어 있지 않다. */
    private static String reasonOf(Exception e) {
        String text = e instanceof IllegalStateException && e.getMessage() != null ? e.getMessage() : "AI 답을 읽지 못했어요";
        text = text.replaceAll("\\s+", " ").trim();
        if (text.length() > 140) {
            text = text.substring(0, 140) + "…";
        }
        if (e instanceof GoalAiClient.ApiStatusException api) {
            String hint = switch (api.status()) {
                case 503, 500, 502, 504 -> "AI 서버가 지금 몰려 있어요. 잠시 뒤에 다시 보내 보세요. ";
                case 429 -> "사용 한도에 걸렸어요. 잠시 뒤에 다시 보내 보세요. ";
                case 401, 403 -> "키를 확인해 주세요. ";
                default -> "";
            };
            return hint + text;
        }
        return text;
    }

    private synchronized void checkRate() {
        long now = System.currentTimeMillis();
        while (!recentCalls.isEmpty() && now - recentCalls.peekFirst() > WINDOW_MILLIS) {
            recentCalls.pollFirst();
        }
        if (recentCalls.size() >= CALLS_PER_MINUTE) {
            throw new GoalAiException(HttpStatus.TOO_MANY_REQUESTS, "요청이 너무 많아요. 잠시 뒤에 다시 보내 주세요.");
        }
        recentCalls.addLast(now);
    }

    /* ---------- 다듬기: AI든 기본 틀이든 같은 규칙으로 ---------- */

    private GoalAiFormRequest.Current cleanCurrent(GoalAiFormRequest.Current current) {
        if (current == null) {
            return null;
        }
        return new GoalAiFormRequest.Current(
            cut(current.title(), TITLE_MAX_LENGTH),
            validDate(current.startDate()),
            validDate(current.endDate()),
            cleanBlocks(current.blocks()));
    }

    /** 길이·개수 제한, 모르는 블록 종류 제거, 올바른 날짜만. */
    GoalAiFormResponse sanitize(GoalAiFormResponse raw) {
        String startDate = validDate(raw.startDate());
        String endDate = validDate(raw.endDate());
        if (startDate != null && endDate != null && startDate.compareTo(endDate) > 0) {
            endDate = null;
        }
        return new GoalAiFormResponse(
            cut(raw.reply(), REPLY_MAX_LENGTH),
            cut(raw.title(), TITLE_MAX_LENGTH),
            startDate,
            endDate,
            raw.source(),
            cleanBlocks(raw.blocks()));
    }

    static List<GoalAiFormResponse.Block> cleanBlocks(List<GoalAiFormResponse.Block> blocks) {
        if (blocks == null) {
            return List.of();
        }
        List<GoalAiFormResponse.Block> out = new ArrayList<>();
        for (GoalAiFormResponse.Block block : blocks) {
            if (block == null || block.type() == null) {
                continue;
            }
            GoalAiFormResponse.Block cleaned = cleanBlock(block);
            if (cleaned != null) {
                out.add(cleaned);
            }
            if (out.size() >= BLOCK_MAX) {
                break;
            }
        }
        return out;
    }

    private static GoalAiFormResponse.Block cleanBlock(GoalAiFormResponse.Block block) {
        String title = cut(block.title(), BLOCK_TITLE_MAX_LENGTH);
        switch (block.type().trim().toLowerCase(Locale.ROOT)) {
            case GoalAiFormResponse.TABLE -> {
                List<GoalAiFormResponse.Field> rows = nonNull(block.rows()).stream()
                    .map(row -> new GoalAiFormResponse.Field(cut(row.label(), FIELD_LABEL_MAX_LENGTH), cut(row.value(), FIELD_VALUE_MAX_LENGTH)))
                    .filter(row -> !row.label().isEmpty() || !row.value().isEmpty())
                    .limit(FIELD_MAX)
                    .toList();
                return rows.isEmpty() && title.isEmpty() ? null : GoalAiFormResponse.Block.table(title, rows);
            }
            case GoalAiFormResponse.CHECKLIST -> {
                List<GoalAiFormResponse.Item> items = nonNull(block.items()).stream()
                    .map(item -> new GoalAiFormResponse.Item(cut(item.text(), ITEM_TEXT_MAX_LENGTH), item.done()))
                    .filter(item -> !item.text().isEmpty())
                    .limit(ITEM_MAX)
                    .toList();
                return items.isEmpty() && title.isEmpty() ? null : GoalAiFormResponse.Block.checklist(title, items);
            }
            case GoalAiFormResponse.TRACKER -> {
                List<String> columns = columnNames(block.columns(), TRACKER_COLUMN_MAX);
                if (columns.isEmpty()) {
                    columns = List.of("월", "화", "수", "목", "금", "토", "일");
                }
                int size = columns.size();
                List<GoalAiFormResponse.Track> tracks = nonNull(block.tracks()).stream()
                    .map(track -> new GoalAiFormResponse.Track(cut(track.label(), FIELD_LABEL_MAX_LENGTH), fit(track.checks(), size)))
                    .filter(track -> !track.label().isEmpty() || track.checks().contains(Boolean.TRUE))
                    .limit(TRACKER_ROW_MAX)
                    .toList();
                return GoalAiFormResponse.Block.tracker(title, columns, tracks);
            }
            case GoalAiFormResponse.PROGRESS -> {
                return GoalAiFormResponse.Block.progress(title, cut(block.unit(), UNIT_MAX_LENGTH),
                    number(block.start()), number(block.target()), number(block.current()));
            }
            case GoalAiFormResponse.LOG -> {
                List<String> columns = columnNames(block.columns(), LOG_COLUMN_MAX);
                if (columns.size() < 2) {
                    columns = List.of("날짜", "기록");
                }
                int size = columns.size();
                List<List<String>> entries = nonNull(block.entries()).stream()
                    .map(entry -> {
                        List<String> cells = new ArrayList<>();
                        for (int i = 0; i < size; i++) {
                            cells.add(cut(entry != null && i < entry.size() ? entry.get(i) : "", LOG_CELL_MAX_LENGTH));
                        }
                        return (List<String>) cells;
                    })
                    .filter(cells -> cells.stream().anyMatch(cell -> !cell.isEmpty()))
                    .limit(LOG_ROW_MAX)
                    .toList();
                return GoalAiFormResponse.Block.log(title, columns, entries);
            }
            case GoalAiFormResponse.NOTE -> {
                String text = cut(block.text(), NOTE_MAX_LENGTH);
                return text.isEmpty() && title.isEmpty() ? null : GoalAiFormResponse.Block.note(title, text);
            }
            default -> {
                return null; // 모르는 종류는 버린다
            }
        }
    }

    private static <T> List<T> nonNull(List<T> list) {
        return list == null ? List.of() : list.stream().filter(item -> item != null).toList();
    }

    private static List<String> columnNames(List<String> columns, int max) {
        return nonNull(columns).stream()
            .map(name -> cut(name, COLUMN_NAME_MAX_LENGTH))
            .limit(max)
            .toList();
    }

    /** 체크 칸 수를 열 수에 맞춘다 (모자라면 false로 채우고 넘치면 자른다). */
    private static List<Boolean> fit(List<Boolean> checks, int size) {
        List<Boolean> out = new ArrayList<>(size);
        for (int i = 0; i < size; i++) {
            out.add(checks != null && i < checks.size() && Boolean.TRUE.equals(checks.get(i)));
        }
        return out;
    }

    private static Double number(Double value) {
        if (value == null || value.isNaN() || value.isInfinite() || Math.abs(value) >= NUMBER_LIMIT) {
            return null;
        }
        return Math.round(value * 100d) / 100d; // 소수 둘째 자리까지
    }

    /** 화면이 그대로 입력칸에 넣어도 되는 값만 남긴다. 범위를 벗어나면 그 값은 null(바꾸지 않음). */
    GoalAiMoneyResponse sanitizeMoney(GoalAiMoneyResponse raw, GoalAiMoneyRequest.Current current) {
        String endDate = validDate(raw.endDate());
        String startDate = current == null ? null : validDate(current.startDate());
        if (endDate != null && startDate != null && endDate.compareTo(startDate) <= 0) {
            endDate = null; // 목표일은 시작일보다 뒤여야 한다
        }
        String cycle = raw.depositCycle() == null ? "" : raw.depositCycle().trim();
        return new GoalAiMoneyResponse(
            cut(raw.message(), MONEY_MESSAGE_MAX_LENGTH),
            endDate,
            amountOrNull(raw.targetAmount(), TARGET_MIN),
            amountOrNull(raw.startAmount(), 0),
            amountOrNull(raw.depositAmount(), 1),
            cycle.isEmpty() || cycle.length() > CYCLE_MAX_LENGTH ? null : cycle);
    }

    private static Long amountOrNull(Long value, long min) {
        return value != null && value >= min && value < AMOUNT_LIMIT ? value : null;
    }

    private static String cut(String value, int max) {
        String text = value == null ? "" : value.trim();
        return text.length() > max ? text.substring(0, max) : text;
    }

    /** yyyy-MM-dd로 읽히고 2000~2099년 안일 때만 받아들인다. 아니면 null. */
    private static String validDate(String value) {
        if (!StringUtils.hasText(value)) {
            return null;
        }
        try {
            LocalDate date = LocalDate.parse(value.trim());
            return date.getYear() >= 2000 && date.getYear() <= 2099 ? date.toString() : null;
        } catch (DateTimeParseException e) {
            return null;
        }
    }
}
