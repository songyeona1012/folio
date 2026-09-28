package com.example.folio.service;

import java.time.LocalDate;
import java.util.List;
import org.springframework.stereotype.Component;

/** Diary persistence and archive integration are intentionally deferred. */
@Component
public class DiarySignalSource {

    public static class Entry {

        public LocalDate date;
        public String text;
        public String timetable;
        public Integer rating;
    }

    public List<Entry> findByDateBetweenOrderByDateAsc(LocalDate start, LocalDate end) {
        return List.of();
    }
}
