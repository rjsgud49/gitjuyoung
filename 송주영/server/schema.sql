-- gacha 데이터베이스 생성
CREATE DATABASE IF NOT EXISTS gacha CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE gacha;

-- 전역 설정 (항상 id=1 단일 행)
CREATE TABLE IF NOT EXISTS global_config (
  id        TINYINT PRIMARY KEY DEFAULT 1,
  gacha_items_version VARCHAR(50)  NOT NULL DEFAULT 'v1',
  gacha_pull_cost     INT          NOT NULL DEFAULT 10,
  starting_coins      INT          NOT NULL DEFAULT 30,
  CONSTRAINT one_row CHECK (id = 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 가챠 아이템
CREATE TABLE IF NOT EXISTS gacha_items (
  id          VARCHAR(20)                                  PRIMARY KEY,
  name        VARCHAR(200)                                 NOT NULL,
  rarity      ENUM('common','rare','epic','legendary')     NOT NULL,
  probability INT                                          NOT NULL,
  image       VARCHAR(1000)                                NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 이벤트
CREATE TABLE IF NOT EXISTS events (
  id          VARCHAR(36)  PRIMARY KEY,
  name        VARCHAR(200) NOT NULL,
  type        ENUM('pull_discount','coin_multiplier') NOT NULL,
  value       DECIMAL(10,2) NOT NULL,
  description TEXT,
  expires_at  DATETIME,
  is_active   TINYINT(1)   NOT NULL DEFAULT 1,
  created_at  DATETIME     NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 공지사항
CREATE TABLE IF NOT EXISTS announcements (
  id         VARCHAR(36)  PRIMARY KEY,
  title      VARCHAR(200) NOT NULL,
  content    TEXT         NOT NULL,
  type       ENUM('info','event','warning','update') NOT NULL DEFAULT 'info',
  is_pinned  TINYINT(1)   NOT NULL DEFAULT 0,
  created_at DATETIME     NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 유저
CREATE TABLE IF NOT EXISTS users (
  id                   INT AUTO_INCREMENT PRIMARY KEY,
  github_login         VARCHAR(100) NOT NULL,
  github_id            BIGINT       NOT NULL,
  coins                INT          NOT NULL DEFAULT 30,
  total_pulls          INT          NOT NULL DEFAULT 0,
  github_username      VARCHAR(100),
  github_total_commits INT,
  github_fetched_at    DATETIME,
  last_checkin_date    DATE         NULL DEFAULT NULL,
  created_at           DATETIME     DEFAULT CURRENT_TIMESTAMP,
  updated_at           DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_login     (github_login),
  UNIQUE KEY uq_github_id (github_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- last_checkin_date is included in the CREATE TABLE above.
-- If upgrading an existing DB, run manually:
-- ALTER TABLE users ADD COLUMN last_checkin_date DATE NULL DEFAULT NULL;

-- 유저 수집 아이템
CREATE TABLE IF NOT EXISTS user_collected_items (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  user_id          INT          NOT NULL,
  item_id          VARCHAR(20)  NOT NULL,
  item_name        VARCHAR(200) NOT NULL,
  item_rarity      ENUM('common','rare','epic','legendary') NOT NULL,
  item_image       VARCHAR(1000) NOT NULL,
  item_probability INT          NOT NULL,
  count            INT          NOT NULL DEFAULT 1,
  first_acquired_at DATETIME   NOT NULL,
  UNIQUE KEY uq_user_item (user_id, item_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
