// 테스트용 DB에서 애플리케이션 설정이 정상적으로 시작되는지 확인합니다.
package com.example.folio;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;

@SpringBootTest(
    properties = {
        "spring.datasource.url=jdbc:h2:mem:context-test;DB_CLOSE_DELAY=-1",
        "spring.jpa.hibernate.ddl-auto=create-drop",
        "gemini.api.key=",
        "openai.api.key=",
    }
)
class FolioApplicationTests {

    @Test
    void contextLoads() {}
}
