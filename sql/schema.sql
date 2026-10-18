-- AI Support Desk: MySQL 8 schema
CREATE DATABASE IF NOT EXISTS support_desk CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE support_desk;

CREATE TABLE IF NOT EXISTS users (
  id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  full_name     VARCHAR(120) NOT NULL,
  email         VARCHAR(190) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role          ENUM('customer','agent','admin') NOT NULL DEFAULT 'customer',
  is_active     TINYINT(1) NOT NULL DEFAULT 1,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_users_email (email),
  KEY idx_users_role_active (role, is_active)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS categories (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(80) NOT NULL,
  description VARCHAR(255) NULL,
  UNIQUE KEY uq_categories_name (name)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS agent_profiles (
  user_id          BIGINT UNSIGNED PRIMARY KEY,
  category_id      INT UNSIGNED NULL,
  max_open_tickets SMALLINT UNSIGNED NOT NULL DEFAULT 10,
  is_available     TINYINT(1) NOT NULL DEFAULT 1,
  CONSTRAINT fk_ap_user     FOREIGN KEY (user_id)     REFERENCES users(id)      ON DELETE CASCADE,
  CONSTRAINT fk_ap_category FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL,
  KEY idx_ap_routing (category_id, is_available)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS sla_policies (
  id                     INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  priority               ENUM('low','medium','high','critical') NOT NULL,
  first_response_minutes INT UNSIGNED NOT NULL,
  resolution_minutes     INT UNSIGNED NOT NULL,
  UNIQUE KEY uq_sla_priority (priority)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS tickets (
  id                 BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  ticket_no          VARCHAR(20) NOT NULL,
  customer_id        BIGINT UNSIGNED NOT NULL,
  category_id        INT UNSIGNED NULL,
  subject            VARCHAR(200) NOT NULL,
  description        TEXT NOT NULL,
  status             ENUM('open','in_progress','waiting_customer','resolved','closed') NOT NULL DEFAULT 'open',
  priority           ENUM('low','medium','high','critical') NOT NULL DEFAULT 'medium',
  sentiment          ENUM('positive','neutral','negative','angry') NOT NULL DEFAULT 'neutral',
  sentiment_score    DECIMAL(4,3) NULL,
  ai_confidence      DECIMAL(4,3) NULL,
  assigned_agent_id  BIGINT UNSIGNED NULL,
  sla_policy_id      INT UNSIGNED NULL,
  first_response_due DATETIME NULL,
  resolution_due     DATETIME NULL,
  first_responded_at DATETIME NULL,
  resolved_at        DATETIME NULL,
  resolution_minutes INT UNSIGNED NULL,
  paused_at          DATETIME NULL,
  sla_breached       TINYINT(1) NOT NULL DEFAULT 0,
  created_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_tickets_no (ticket_no),
  CONSTRAINT fk_t_customer FOREIGN KEY (customer_id)       REFERENCES users(id),
  CONSTRAINT fk_t_category FOREIGN KEY (category_id)       REFERENCES categories(id) ON DELETE SET NULL,
  CONSTRAINT fk_t_agent    FOREIGN KEY (assigned_agent_id) REFERENCES users(id)      ON DELETE SET NULL,
  CONSTRAINT fk_t_sla      FOREIGN KEY (sla_policy_id)     REFERENCES sla_policies(id),
  KEY idx_t_status_priority (status, priority),
  KEY idx_t_agent_status    (assigned_agent_id, status),
  KEY idx_t_customer        (customer_id, created_at),
  KEY idx_t_category        (category_id, status),
  KEY idx_t_sla_due         (status, resolution_due),
  FULLTEXT KEY ft_t_text (subject, description)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS ticket_messages (
  id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  ticket_id   BIGINT UNSIGNED NOT NULL,
  sender_id   BIGINT UNSIGNED NULL,
  sender_type ENUM('customer','agent','ai','system') NOT NULL,
  body        TEXT NOT NULL,
  is_internal TINYINT(1) NOT NULL DEFAULT 0,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_m_ticket FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
  CONSTRAINT fk_m_sender FOREIGN KEY (sender_id) REFERENCES users(id)   ON DELETE SET NULL,
  KEY idx_m_ticket_time (ticket_id, created_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS agent_assignments (
  id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  ticket_id     BIGINT UNSIGNED NOT NULL,
  agent_id      BIGINT UNSIGNED NOT NULL,
  assigned_by   ENUM('ai_router','admin','agent') NOT NULL DEFAULT 'ai_router',
  reason        VARCHAR(255) NULL,
  assigned_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  unassigned_at TIMESTAMP NULL,
  CONSTRAINT fk_aa_ticket FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
  CONSTRAINT fk_aa_agent  FOREIGN KEY (agent_id)  REFERENCES users(id),
  KEY idx_aa_ticket (ticket_id, assigned_at),
  KEY idx_aa_agent  (agent_id, assigned_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS sla_logs (
  id         BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  ticket_id  BIGINT UNSIGNED NOT NULL,
  event_type ENUM('started','warning_75','warning_90','breached','met','paused','resumed') NOT NULL,
  sla_type   ENUM('first_response','resolution') NOT NULL,
  details    JSON NULL,
  logged_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_sl_ticket FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
  KEY idx_sl_ticket (ticket_id, logged_at),
  KEY idx_sl_event  (event_type, logged_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS ai_analysis_logs (
  id                 BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  ticket_id          BIGINT UNSIGNED NOT NULL,
  engine             VARCHAR(40) NOT NULL,
  predicted_category VARCHAR(80) NULL,
  predicted_priority ENUM('low','medium','high','critical') NULL,
  sentiment_score    DECIMAL(4,3) NULL,
  confidence         DECIMAL(4,3) NULL,
  raw_response       JSON NULL,
  created_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_ai_ticket FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
  KEY idx_ai_ticket (ticket_id)
) ENGINE=InnoDB;

INSERT IGNORE INTO sla_policies (priority, first_response_minutes, resolution_minutes) VALUES
  ('critical', 15, 240), ('high', 60, 480), ('medium', 240, 1440), ('low', 480, 4320);

INSERT IGNORE INTO categories (name, description) VALUES
  ('Billing', 'Payments, refunds, invoices'),
  ('Technical', 'Bugs, errors, outages'),
  ('Account', 'Login, password, profile'),
  ('Feature Request', 'Suggestions and improvements'),
  ('General', 'Everything else');
