package com.example.folio.service;

import com.example.folio.dto.GoalAiFormRequest;
import com.example.folio.dto.GoalAiFormResponse;
import com.example.folio.dto.GoalAiFormResponse.Block;
import com.example.folio.dto.GoalAiFormResponse.Field;
import com.example.folio.dto.GoalAiFormResponse.Item;
import com.example.folio.dto.GoalAiFormResponse.Track;
import org.springframework.stereotype.Component;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * AI 키가 없거나 AI를 부르지 못했을 때 쓰는 기본 규칙.
 *
 * 1) 처음 만들 때: 말에서 기간("3개월", "6주" …)과 숫자 목표("5kg", "900점" …)를 읽고,
 *    목표의 종류(감량·공부·독서·운동·저축 …)에 맞는 블록을 골라 양식을 만든다.
 * 2) 이미 양식이 있을 때: "습관표 추가", "기록표 빼 줘", "다른 양식" 같은 짧은 말을 알아듣고 블록을 더하거나 뺀다.
 *    알아듣지 못하면 양식은 그대로 두고 쓸 수 있는 말을 알려 준다 (AI인 척하지 않는다).
 */
@Component
public class GoalBasicFormBuilder {

    private static final int BLOCK_MAX = 10;

    private static final Map<String, Integer> KOREAN_NUMBER = Map.ofEntries(
        Map.entry("한", 1), Map.entry("두", 2), Map.entry("세", 3), Map.entry("네", 4), Map.entry("다섯", 5),
        Map.entry("여섯", 6), Map.entry("일곱", 7), Map.entry("여덟", 8), Map.entry("아홉", 9), Map.entry("열", 10));

    private static final Pattern DURATION = Pattern.compile(
        "(\\d{1,3}|한|두|세|네|다섯|여섯|일곱|여덟|아홉|열)\\s*(개월|달|주일|주|년|일)(\\s*(안에|동안|내에|내로|까지|뒤에))?");

    private static final Pattern AMOUNT = Pattern.compile(
        "(\\d{1,9}(?:\\.\\d{1,2})?)\\s*(kg|킬로그램|킬로|키로|km|킬로미터|점|권|시간|분|만원|원|회|번|개(?!월)|쪽|페이지|문제|%|퍼센트)",
        Pattern.CASE_INSENSITIVE);

    private static final Pattern WISH_TAIL = Pattern.compile("\\s*(\\S*?고\\s*)?싶(어요|어|습니다|네요|다)[.!?~]*$");

    private static final List<String> WEEK = List.of("월", "화", "수", "목", "금", "토", "일");

    /** 목표의 종류 */
    private enum Kind { WEIGHT, STUDY, READING, EXERCISE, MONEY, GENERAL }

    public GoalAiFormResponse build(GoalAiFormRequest request, LocalDate today, String notice) {
        String prefix = notice == null ? "" : notice + " ";
        String prompt = request.prompt() == null ? "" : request.prompt().trim();

        if (request.current() != null && request.current().blocks() != null && !request.current().blocks().isEmpty()) {
            return edit(request.current(), prompt, prefix);
        }

        // ---- 기간 ----
        Matcher matcher = DURATION.matcher(prompt);
        LocalDate end = null;
        String period = "";
        String rest = prompt;
        while (matcher.find()) {
            int amount = amountOf(matcher.group(1));
            String unit = matcher.group(2);
            if (amount <= 0 || ("일".equals(unit) && !Character.isDigit(matcher.group(1).charAt(0)))) {
                continue; // "네일"처럼 숫자가 아닌 말 뒤의 '일'은 기간이 아니다
            }
            end = switch (unit) {
                case "개월", "달" -> today.plusMonths(amount);
                case "주일", "주" -> today.plusWeeks(amount);
                case "년" -> today.plusYears(amount);
                default -> today.plusDays(amount);
            };
            period = amount + (unit.equals("주일") ? "주" : unit.equals("달") ? "개월" : unit);
            rest = prompt.substring(0, matcher.start()) + prompt.substring(matcher.end());
            break;
        }

        String goal = WISH_TAIL.matcher(rest).replaceFirst("").trim();
        if (goal.isEmpty()) {
            goal = prompt;
        }
        String title = goal.length() > 40 ? goal.substring(0, 40) : goal;

        Kind kind = kindOf(prompt);
        List<Block> blocks = design(kind, title, period, prompt, 0);

        return new GoalAiFormResponse(
            prefix + "'" + title + "'에 맞춰 " + describe(blocks) + "(으)로 양식을 만들었어요. 칸을 눌러 마음대로 고쳐 보세요.",
            title,
            end == null ? null : today.toString(),
            end == null ? null : end.toString(),
            "BASIC",
            blocks);
    }

    /* ---------- 이미 있는 양식 고치기 ---------- */

    private GoalAiFormResponse edit(GoalAiFormRequest.Current current, String prompt, String prefix) {
        List<Block> blocks = new ArrayList<>(current.blocks());
        String text = prompt.replace(" ", "");
        String reply;

        String type = typeMentioned(text);
        boolean remove = text.matches(".*(지워|지우|삭제|빼|없애).*");
        boolean redesign = text.matches(".*(다른양식|다른구성|다르게|새로|바꿔|바꾸|다시만들|다른거|다른것).*");

        if (remove && type != null) {
            int before = blocks.size();
            blocks.removeIf(block -> type.equals(block.type()));
            reply = blocks.size() < before
                ? "'" + nameOf(type) + "'을(를) 지웠어요."
                : "지울 '" + nameOf(type) + "'이(가) 없어요.";
        } else if (type != null) {
            if (blocks.size() >= BLOCK_MAX) {
                reply = "블록은 " + BLOCK_MAX + "개까지 둘 수 있어요. 쓰지 않는 블록을 먼저 지워 주세요.";
            } else {
                blocks.add(defaultBlock(type, kindOf(current.title() + " " + prompt), current.title()));
                reply = "'" + nameOf(type) + "'을(를) 맨 아래에 추가했어요.";
            }
        } else if (redesign) {
            Kind kind = kindOf(current.title() + " " + prompt);
            int variant = Math.abs((current.title() + blocks.size()).hashCode()) % 2 + 1;
            blocks = design(kind, current.title(), "", current.title() + " " + prompt, variant);
            reply = describe(blocks) + "(으)로 구성을 바꿔 봤어요. 마음에 들지 않으면 '되돌리기'를 눌러 주세요.";
        } else {
            return new GoalAiFormResponse(
                prefix + "지금은 인공지능 없이 기본 규칙으로만 고칠 수 있어서 양식은 그대로 두었어요. "
                    + "'습관표 추가', '기록표 추가', '진행도 추가', '메모 추가', '체크리스트 빼 줘', '다른 양식' 같은 말을 알아들어요.",
                current.title(), current.startDate(), current.endDate(), "BASIC", current.blocks());
        }

        return new GoalAiFormResponse(prefix + reply, current.title(), current.startDate(), current.endDate(), "BASIC", blocks);
    }

    private static String typeMentioned(String text) {
        if (text.matches(".*(습관|요일|매일체크|출석).*")) return GoalAiFormResponse.TRACKER;
        if (text.matches(".*(기록표|기록|일지|로그).*")) return GoalAiFormResponse.LOG;
        if (text.matches(".*(진행도|진행|진척|달성률|퍼센트|막대|그래프).*")) return GoalAiFormResponse.PROGRESS;
        if (text.matches(".*(메모|노트|다짐|한마디).*")) return GoalAiFormResponse.NOTE;
        if (text.matches(".*(체크리스트|할일|해야할|단계).*")) return GoalAiFormResponse.CHECKLIST;
        if (text.matches(".*(항목|(?<!목)표).*")) return GoalAiFormResponse.TABLE; // "목표"의 표는 빼고
        return null;
    }

    private static String nameOf(String type) {
        return switch (type) {
            case GoalAiFormResponse.TABLE -> "항목 표";
            case GoalAiFormResponse.CHECKLIST -> "체크리스트";
            case GoalAiFormResponse.TRACKER -> "습관표";
            case GoalAiFormResponse.PROGRESS -> "진행도";
            case GoalAiFormResponse.LOG -> "기록표";
            default -> "메모";
        };
    }

    private static String describe(List<Block> blocks) {
        List<String> names = new ArrayList<>();
        for (Block block : blocks) {
            String name = nameOf(block.type());
            if (!names.contains(name)) {
                names.add(name);
            }
        }
        return String.join("·", names);
    }

    /* ---------- 목표 종류에 맞는 블록 고르기 ---------- */

    private static Kind kindOf(String text) {
        String t = text == null ? "" : text.toLowerCase();
        if (t.matches(".*(감량|다이어트|체중|몸무게|살 ?빼|살을|kg|킬로|키로).*")) return Kind.WEIGHT;
        if (t.matches(".*(독서|책|권).*")) return Kind.READING;
        if (t.matches(".*(저축|모으|모으기|적금|돈|만원|원 ).*") || t.matches(".*\\d+원.*")) return Kind.MONEY;
        if (t.matches(".*(운동|달리기|러닝|헬스|마라톤|걷기|수영|요가|km|스쿼트|푸시업).*")) return Kind.EXERCISE;
        if (t.matches(".*(공부|시험|자격증|토익|토플|점수|합격|기사|수능|과목|단어|영어|코딩|강의).*")) return Kind.STUDY;
        return Kind.GENERAL;
    }

    /** variant 0: 처음 만들 때, 1·2: "다른 양식"을 달라고 했을 때 다른 조합 */
    private List<Block> design(Kind kind, String title, String period, String prompt, int variant) {
        Matcher amount = AMOUNT.matcher(prompt);
        Double target = null;
        String unit = "";
        if (amount.find()) {
            target = Double.valueOf(amount.group(1));
            unit = normalizeUnit(amount.group(2));
        }

        List<Block> blocks = new ArrayList<>();
        switch (kind) {
            case WEIGHT -> {
                blocks.add(Block.progress("감량 진행도", unit.isEmpty() ? "kg" : unit, 0d, target, 0d));
                blocks.add(Block.log("체중 기록", List.of("날짜", "체중(kg)", "메모"), List.of()));
                blocks.add(tracker("매일 습관", "운동하기", "식단 지키기", "물 2L 마시기"));
                if (variant != 1) blocks.add(Block.note("다짐", ""));
            }
            case STUDY -> {
                blocks.add(Block.table("목표 정리", List.of(new Field("목표", title), new Field("기간", period),
                    new Field("하루 분량", ""), new Field("다짐", ""))));
                if (target != null) blocks.add(Block.progress("점수", unit, null, target, null));
                blocks.add(Block.checklist("단계별 계획", items("기초 다지기", "약한 부분 집중하기", "실전 문제 풀기", "마지막 점검하기")));
                blocks.add(tracker("공부 체크", "공부하기", "복습하기"));
            }
            case READING -> {
                blocks.add(Block.progress("읽은 책", unit.isEmpty() ? "권" : unit, 0d, target, 0d));
                blocks.add(Block.log("독서 기록", List.of("날짜", "책 제목", "한 줄 느낌"), List.of()));
                blocks.add(tracker("독서 습관", "책 읽기"));
            }
            case EXERCISE -> {
                blocks.add(tracker("운동 체크", "운동하기", "스트레칭"));
                blocks.add(Block.log("운동 기록", List.of("날짜", "운동", "시간·거리"), List.of()));
                if (target != null) blocks.add(Block.progress("목표까지", unit, 0d, target, 0d));
            }
            case MONEY -> {
                blocks.add(Block.progress("모은 돈", unit.isEmpty() ? "원" : unit, 0d, target, 0d));
                blocks.add(Block.log("저축 기록", List.of("날짜", "금액", "메모"), List.of()));
                blocks.add(Block.note("팁", "입출금을 자세히 관리하려면 '금전' 양식도 써 보세요."));
            }
            default -> {
                blocks.add(Block.table("목표 정리", List.of(new Field("목표", title), new Field("기간", period),
                    new Field("실천 방법", ""), new Field("다짐", ""))));
                blocks.add(Block.checklist("단계별 계획", items("지금 상태 확인하기", "이번 주에 할 일 정하기", "중간에 점검하기", "마무리하고 돌아보기")));
                blocks.add(tracker("매일 체크", "계획한 만큼 해내기"));
            }
        }

        if (variant > 0) {
            // 다른 조합: 순서를 뒤집고, 없던 블록 하나를 더한다
            Collections.reverse(blocks);
            boolean hasChecklist = blocks.stream().anyMatch(b -> GoalAiFormResponse.CHECKLIST.equals(b.type()));
            boolean hasLog = blocks.stream().anyMatch(b -> GoalAiFormResponse.LOG.equals(b.type()));
            if (variant == 1 && !hasChecklist) {
                blocks.add(Block.checklist("이번 주 할 일", items("", "", "")));
            } else if (!hasLog) {
                blocks.add(Block.log("기록", List.of("날짜", "한 일", "메모"), List.of()));
            } else {
                blocks.add(Block.note("메모", ""));
            }
        }
        return blocks;
    }

    private static Block defaultBlock(String type, Kind kind, String title) {
        return switch (type) {
            case GoalAiFormResponse.TABLE -> Block.table("항목 표", List.of(new Field("목표", title == null ? "" : title), new Field("", "")));
            case GoalAiFormResponse.CHECKLIST -> Block.checklist("체크리스트", items("", "", ""));
            case GoalAiFormResponse.TRACKER -> tracker("습관표", kind == Kind.WEIGHT ? "운동하기" : "계획한 만큼 해내기");
            case GoalAiFormResponse.PROGRESS -> Block.progress("진행도", kind == Kind.WEIGHT ? "kg" : "", 0d, null, 0d);
            case GoalAiFormResponse.LOG -> Block.log("기록표", List.of("날짜", "기록", "메모"), List.of());
            default -> Block.note("메모", "");
        };
    }

    private static Block tracker(String title, String... labels) {
        List<Track> tracks = new ArrayList<>();
        for (String label : labels) {
            tracks.add(new Track(label, Collections.nCopies(WEEK.size(), false)));
        }
        return Block.tracker(title, WEEK, tracks);
    }

    private static List<Item> items(String... texts) {
        List<Item> items = new ArrayList<>();
        for (String text : texts) {
            items.add(new Item(text, false));
        }
        return items;
    }

    private static String normalizeUnit(String unit) {
        String u = unit.toLowerCase();
        return switch (u) {
            case "킬로그램", "킬로", "키로" -> "kg";
            case "킬로미터" -> "km";
            case "퍼센트" -> "%";
            case "페이지" -> "쪽";
            case "번" -> "회";
            default -> u;
        };
    }

    private static int amountOf(String text) {
        if (Character.isDigit(text.charAt(0))) {
            return Integer.parseInt(text);
        }
        return KOREAN_NUMBER.getOrDefault(text, 0);
    }
}
