package com.example.folio.service;

import com.example.folio.dto.DairyRatingRow;
import com.example.folio.dto.DairyRequest;
import com.example.folio.dto.DairyResponse;
import com.example.folio.dto.DairyYearSummary;
import com.example.folio.entity.Dairy;
import com.example.folio.entity.DairyType;
import com.example.folio.repository.DairyRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDate;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.TreeMap;

@Service
@Transactional(readOnly = true)
public class DairyService {

    private static final int MAX_CONTENT_LENGTH = 10_000;
    private static final int MAX_HOUR_LENGTH = 500;
    private static final int MAX_DELETE_AT_ONCE = 100;

    private final DairyRepository dairyRepository;

    public DairyService(DairyRepository dairyRepository) {
        this.dairyRepository = dairyRepository;
    }

    /** 특정 날짜의 일기 (없으면 빈 Optional) */
    public Optional<DairyResponse> findByDate(LocalDate date) {
        return dairyRepository.findByDate(date).map(DairyResponse::from);
    }

    /** 한 달 치 일기 목록 (월별 폴더) */
    public List<DairyResponse> findByMonth(int year, int month) {
        YearMonth ym = toYearMonth(year, month);
        return dairyRepository.findByDateBetweenOrderByDateAsc(ym.atDay(1), ym.atEndOfMonth())
                .stream()
                .map(DairyResponse::from)
                .toList();
    }

    /** 연간 요약: 월별 일기 수 + 별점 평균, 그리고 일기가 있는 달 폴더 */
    public DairyYearSummary summarizeYear(int year, LocalDate today) {
        if (year < 2000 || year > 2100) {
            throw badRequest("연도는 2000~2100 사이로 입력해주세요.");
        }

        int shownMonths;
        if (year < today.getYear()) {
            shownMonths = 12;
        } else if (year == today.getYear()) {
            shownMonths = today.getMonthValue();
        } else {
            shownMonths = 0;
        }

        int[] counts = new int[13];
        int[] ratedCounts = new int[13];
        int[] ratingSums = new int[13];

        List<DairyRatingRow> rows = dairyRepository.findRatingsBetween(
                LocalDate.of(year, 1, 1), LocalDate.of(year, 12, 31));
        for (DairyRatingRow row : rows) {
            int m = row.date().getMonthValue();
            counts[m]++;
            if (row.rating() > 0) {
                ratedCounts[m]++;
                ratingSums[m] += row.rating();
            }
        }

        // 기분 그래프: 1월 ~ 보여줄 달까지
        List<DairyYearSummary.Month> months = new ArrayList<>();
        for (int m = 1; m <= shownMonths; m++) {
            months.add(monthSummary(m, counts, ratedCounts, ratingSums));
        }

        // 폴더: 일기를 한 편이라도 쓴 달만
        List<DairyYearSummary.Month> folders = new ArrayList<>();
        for (int m = 1; m <= 12; m++) {
            if (counts[m] > 0) {
                folders.add(monthSummary(m, counts, ratedCounts, ratingSums));
            }
        }

        return new DairyYearSummary(year, shownMonths, months, folders);
    }

    private static DairyYearSummary.Month monthSummary(int m, int[] counts, int[] ratedCounts, int[] ratingSums) {
        Double average = ratedCounts[m] == 0
                ? null
                : Math.round(ratingSums[m] * 10.0 / ratedCounts[m]) / 10.0;
        return new DairyYearSummary.Month(m, counts[m], average);
    }

    /** 저장: 그 날짜에 일기가 있으면 수정, 없으면 새로 만듭니다. */
    @Transactional
    public DairyResponse save(DairyRequest request, LocalDate today) {
        if (request == null || request.date() == null) {
            throw badRequest("일기 날짜를 선택해주세요.");
        }
        if (request.date().isAfter(today)) {
            throw badRequest("아직 오지 않은 날의 일기는 쓸 수 없어요.");
        }

        int rating = request.rating() == null ? 0 : request.rating();
        if (rating < 0 || rating > 5) {
            throw badRequest("별점은 0~5 사이여야 해요.");
        }

        DairyType type = request.type() == null ? DairyType.FREEFORM : request.type();
        String content = normalize(request.content());
        if (content != null && content.length() > MAX_CONTENT_LENGTH) {
            throw badRequest("일기는 " + MAX_CONTENT_LENGTH + "자까지 쓸 수 있어요.");
        }
        Map<Integer, String> hours = cleanHours(request.hours());

        if (content == null && hours.isEmpty()) {
            throw badRequest("일기 내용을 한 줄 이상 적어주세요.");
        }

        Dairy dairy = dairyRepository.findByDate(request.date())
                .orElseGet(() -> new Dairy(request.date()));
        dairy.update(rating, type, content, hours, Boolean.TRUE.equals(request.isPrivate()));
        return DairyResponse.from(dairyRepository.save(dairy));
    }

    @Transactional
    public void delete(Long id) {
        Dairy dairy = dairyRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "이미 삭제된 일기예요."));
        dairyRepository.delete(dairy);
    }

    /** 선택 삭제: 여러 편을 한 번에 지웁니다. 이미 없는 id는 건너뜁니다. 지운 개수를 돌려줍니다. */
    @Transactional
    public int deleteAll(List<Long> ids) {
        if (ids == null || ids.isEmpty()) {
            throw badRequest("삭제할 일기를 선택해주세요.");
        }
        Set<Long> unique = new LinkedHashSet<>(ids);
        unique.remove(null);
        if (unique.size() > MAX_DELETE_AT_ONCE) {
            throw badRequest("한 번에 " + MAX_DELETE_AT_ONCE + "편까지 지울 수 있어요.");
        }
        List<Dairy> found = dairyRepository.findAllById(unique);
        dairyRepository.deleteAll(found);
        return found.size();
    }

    private Map<Integer, String> cleanHours(Map<Integer, String> raw) {
        Map<Integer, String> result = new TreeMap<>();
        if (raw == null) {
            return result;
        }
        raw.forEach((hour, memo) -> {
            if (hour == null || hour < 0 || hour > 23) {
                throw badRequest("시간은 0~23시 사이여야 해요.");
            }
            String text = normalize(memo);
            if (text == null) {
                return;
            }
            if (text.length() > MAX_HOUR_LENGTH) {
                throw badRequest(String.format("%02d시 기록은 %d자까지 쓸 수 있어요.", hour, MAX_HOUR_LENGTH));
            }
            result.put(hour, text);
        });
        return result;
    }

    private static String normalize(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.strip();
        return trimmed.isEmpty() ? null : trimmed;
    }

    private static YearMonth toYearMonth(int year, int month) {
        if (month < 1 || month > 12 || year < 2000 || year > 2100) {
            throw badRequest("올바른 연도와 월을 입력해주세요.");
        }
        return YearMonth.of(year, month);
    }

    private static ResponseStatusException badRequest(String message) {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, message);
    }
}
