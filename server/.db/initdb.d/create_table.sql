CREATE DATABASE IF NOT EXISTS leave_schedule;

USE leave_schedule;

-- 매장 (멀티테넌시 단위). 로그인 화면에서 store_code 를 직접 입력해서 접속.
CREATE TABLE IF NOT EXISTS `stores` (
  `store_id` CHAR(36) NOT NULL,
  `store_code` VARCHAR(50) NOT NULL,
  `store_name` VARCHAR(100) NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`store_id`),
  UNIQUE KEY `uq_store_code` (`store_code`)
);

CREATE TABLE IF NOT EXISTS `agent_informations` (
  `agent_information_id` CHAR(36) NOT NULL,
  `store_id` CHAR(36) NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `name` varchar(20) NOT NULL,
  `job_level` varchar(20) NOT NULL,
  `description` varchar(255) NOT NULL,
  `annualleave` varchar(255) NOT NULL,
  `mandatory_workday` varchar(255) NOT NULL DEFAULT '',
  `is_schedule_manager` TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (`agent_information_id`)
);

-- 직원 로그인 계정. 직원 레코드(agent_informations)와 1:1, 매장 안에서만 login_id 가 유일하면 됨.
CREATE TABLE IF NOT EXISTS `accounts` (
  `account_id` CHAR(36) NOT NULL,
  `store_id` CHAR(36) NOT NULL,
  `agent_information_id` CHAR(36) NOT NULL,
  `login_id` VARCHAR(50) NOT NULL,
  `password_hash` VARCHAR(255) NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`account_id`),
  UNIQUE KEY `uq_store_login` (`store_id`, `login_id`),
  UNIQUE KEY `uq_agent_account` (`agent_information_id`)
);

-- 확정된 휴일/연차 이력: 하루 = 한 행 (인원 x 날짜)
CREATE TABLE IF NOT EXISTS `monthly_leaves` (
  `monthly_leave_id` CHAR(36) NOT NULL,
  `store_id` CHAR(36) NOT NULL,
  `agent_information_id` CHAR(36) NOT NULL,
  `schedule_month` CHAR(7) NOT NULL,                       -- 'YYYY-MM' (leave_date 가 속한 달)
  `leave_date` DATE NOT NULL,                              -- 'YYYY-MM-DD'
  `leave_type` ENUM('leave', 'annual', 'comp') NOT NULL DEFAULT 'leave',
  `confirmed_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`monthly_leave_id`),
  UNIQUE KEY `uq_agent_date` (`agent_information_id`, `leave_date`),
  KEY `idx_schedule_month` (`schedule_month`)
);

-- 앱 전역 설정 (키-값, 매장별). 값은 JSON 문자열로 저장. 예) subjob1, subjob2, essentialWork
CREATE TABLE IF NOT EXISTS `app_settings` (
  `store_id` CHAR(36) NOT NULL,
  `setting_key` VARCHAR(64) NOT NULL,
  `setting_value` TEXT NOT NULL,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`store_id`, `setting_key`)
);
