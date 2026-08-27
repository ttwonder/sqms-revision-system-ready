-- SQMS cloud-shared three-level catalog management.
-- Safe-plan contract: codes are immutable after creation; delete means active=false;
-- relationship changes do not rewrite category/topic/item codes on existing requests.
-- Rerunnable and additive: this migration never updates or deletes change_requests.

begin;

create table if not exists sqms_catalog_categories (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (trim(code) <> ''),
  name_zh text not null check (trim(name_zh) <> ''),
  name_en text not null default '',
  sort_order integer not null default 0 check (sort_order >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists sqms_catalog_topics (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references sqms_catalog_categories(id) on delete restrict,
  code text not null unique check (trim(code) <> ''),
  title_zh text not null check (trim(title_zh) <> ''),
  title_en text not null default '',
  sort_order integer not null default 0 check (sort_order >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists sqms_catalog_items (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid not null references sqms_catalog_topics(id) on delete restrict,
  seed_key text unique,
  code text not null check (trim(code) <> ''),
  title_zh text not null check (trim(title_zh) <> ''),
  title_en text not null default '',
  sort_order integer not null default 0 check (sort_order >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_sqms_catalog_categories_active_sort on sqms_catalog_categories(active, sort_order, code);
create index if not exists idx_sqms_catalog_topics_parent_sort on sqms_catalog_topics(category_id, active, sort_order, code);
create index if not exists idx_sqms_catalog_items_parent_sort on sqms_catalog_items(topic_id, active, sort_order, code);

create or replace function set_sqms_catalog_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_sqms_catalog_categories_updated_at on sqms_catalog_categories;
create trigger trg_sqms_catalog_categories_updated_at before update on sqms_catalog_categories for each row execute function set_sqms_catalog_updated_at();
drop trigger if exists trg_sqms_catalog_topics_updated_at on sqms_catalog_topics;
create trigger trg_sqms_catalog_topics_updated_at before update on sqms_catalog_topics for each row execute function set_sqms_catalog_updated_at();
drop trigger if exists trg_sqms_catalog_items_updated_at on sqms_catalog_items;
create trigger trg_sqms_catalog_items_updated_at before update on sqms_catalog_items for each row execute function set_sqms_catalog_updated_at();

-- Seed the current static catalog without overwriting later administrator renames or moves.
insert into sqms_catalog_categories (code, name_zh, name_en, sort_order)
values
    ('SMM', '安全管理手冊', '', 1),
    ('SMP', '安全管理程序手冊', '', 2),
    ('SMI', '船上安全作業須知手冊', '', 3),
    ('SQMS', '體系清單與記錄', '', 4),
    ('ISO', 'ISO 管理文件', '', 5)
on conflict (code) do nothing;

with seed(category_code, code, title_zh, title_en, sort_order) as (
  values
    ('SMM', 'SMM-01', '公司概況', '', 1),
    ('SMM', 'SMM-02', '公司安全管理組織架構', '', 2),
    ('SMM', 'SMM-03', '公司管理政策、目標、承諾和宣誓', '', 3),
    ('SMM', 'SMM-04', '公司管理政策目標的制定、執行和原則', '', 4),
    ('SMM', 'SMM-05', '公司的責任和權利', '', 5),
    ('SMM', 'SMM-06', '指定人員', '', 6),
    ('SMM', 'SMM-07', '船長的權利和責任', '', 7),
    ('SMM', 'SMM-08', '人員和資源', '', 8),
    ('SMM', 'SMM-09', '文件管理', '', 9),
    ('SMM', 'SMM-10', '船上操作方案的制定', '', 10),
    ('SMM', 'SMM-11', '應急準備', '', 11),
    ('SMM', 'SMM-12', '不符合規定的情況、事故和險情的報告和分析', '', 12),
    ('SMM', 'SMM-13', '船舶和設備的維護', '', 13),
    ('SMM', 'SMM-14', '公司審查、有效性評價和複查', '', 14),
    ('SMM', 'SMM-15', '驗證和證書', '', 15),
    ('SMP', 'SMP-01', '船岸組織架構和職責手冊', '', 1),
    ('SMP', 'SMP-02', '船岸人力資源管理程序', '', 2),
    ('SMP', 'SMP-03', '文件管控程序', '', 3),
    ('SMP', 'SMP-04', '變更管理系統程序', '', 4),
    ('SMP', 'SMP-05', '培訓和演習管理程序', '', 5),
    ('SMP', 'SMP-06', '關鍵性操作和關鍵性設備的管理', '', 6),
    ('SMP', 'SMP-07', '人員職業健康安全、環境安全、風險管控程序', '', 7),
    ('SMP', 'SMP-08', '船舶稽查和複查程序', '', 8),
    ('SMP', 'SMP-09', '公司審查、評估和管理程序', '', 9),
    ('SMP', 'SMP-10', '異常管理程序', '', 10),
    ('SMP', 'SMP-11', '公司應急計劃', '', 11),
    ('SMP', 'SMP-12', '第三方管理程序', '', 12),
    ('SMP', 'SMP-13', '國際標准化組織管理', '', 13),
    ('SMI', 'SMI-01', '船員安全健康管理須知', '', 1),
    ('SMI', 'SMI-02', '安全操作落實須知', '', 2),
    ('SMI', 'SMI-03', '工作許可制度須知', '', 3),
    ('SMI', 'SMI-04', '風險評估管理須知', '', 4),
    ('SMI', 'SMI-05', '船舶當值及操作程序須知', '', 5),
    ('SMI', 'SMI-06', '貨物操作程序須知', '', 6),
    ('SMI', 'SMI-07', '防止環境污染須知', '', 7),
    ('SMI', 'SMI-08', '船舶和設備的使用及維護程序須知', '', 8),
    ('SMI', 'SMI-09', '配件物料燃油滑油管理程序須知', '', 9),
    ('SMI', 'SMI-10', '船舶安防管控須知', '', 10),
    ('SMI', 'SMI-11', '船舶應急處理手冊', '', 11),
    ('SMI', 'SMI-12', '其他作業管理須知', '', 12),
    ('SQMS', 'SQMS-00a', '安全質量管理體系文件總清單', 'SQMS Documents List', 1),
    ('SQMS', 'SQMS-00b', '安全質量管理體系表格總清單', 'SQMS Forms List', 2),
    ('SQMS', 'SQMS-00c', '體系修改記錄', 'SQMS Revised Records', 3),
    ('ISO', 'ISO-01', '品質管理手冊', 'Quality Management Manual', 1),
    ('ISO', 'ISO-02', '職安衛/環境管理手冊', 'Occupational Health & Safety / Environment Management Manual', 2),
    ('ISO', 'ISO-03', '客戶抱怨程序書', 'Customer Complaint Procedure', 3)
)
insert into sqms_catalog_topics (category_id, code, title_zh, title_en, sort_order)
select category.id, seed.code, seed.title_zh, seed.title_en, seed.sort_order
from seed join sqms_catalog_categories category on category.code = seed.category_code
on conflict (code) do nothing;

with seed(topic_code, seed_key, code, title_zh, title_en, sort_order) as (
  values
    ('SMM-01', 'builtin:SMM-01:1:0', 'SMM-01', '公司概況', '', 1),
    ('SMM-02', 'builtin:SMM-02:1:0', 'SMM-02', '公司安全管理組織架構', '', 1),
    ('SMM-03', 'builtin:SMM-03:1:0', 'SMM-03', '公司管理政策、目標、承諾和宣誓', '', 1),
    ('SMM-04', 'builtin:SMM-04:1:0', 'SMM-04', '公司管理政策目標的制定、執行和原則', '', 1),
    ('SMM-05', 'builtin:SMM-05:1:0', 'SMM-05', '公司的責任和權利', '', 1),
    ('SMM-06', 'builtin:SMM-06:1:0', 'SMM-06', '指定人員', '', 1),
    ('SMM-07', 'builtin:SMM-07:1:0', 'SMM-07', '船長的權利和責任', '', 1),
    ('SMM-08', 'builtin:SMM-08:1:0', 'SMM-08', '人員和資源', '', 1),
    ('SMM-09', 'builtin:SMM-09:1:0', 'SMM-09', '文件管理', '', 1),
    ('SMM-10', 'builtin:SMM-10:1:0', 'SMM-10', '船上操作方案的制定', '', 1),
    ('SMM-11', 'builtin:SMM-11:1:0', 'SMM-11', '應急準備', '', 1),
    ('SMM-12', 'builtin:SMM-12:1:0', 'SMM-12', '不符合規定的情況、事故和險情的報告和分析', '', 1),
    ('SMM-13', 'builtin:SMM-13:1:0', 'SMM-13', '船舶和設備的維護', '', 1),
    ('SMM-14', 'builtin:SMM-14:1:0', 'SMM-14', '公司審查、有效性評價和複查', '', 1),
    ('SMM-15', 'builtin:SMM-15:1:0', 'SMM-15', '驗證和證書', '', 1),
    ('SMP-01', 'builtin:SMP-01:1:0', 'SSOR-001', '公司安全質量體系管理內部門架構和要求', '', 1),
    ('SMP-01', 'builtin:SMP-01:2:1', 'SSOR-002', '副總', '', 2),
    ('SMP-01', 'builtin:SMP-01:3:2', 'SSOR-003', '資深經理', '', 3),
    ('SMP-01', 'builtin:SMP-01:4:3', 'SSOR-004', '岸上指定人員（DPA）', '', 4),
    ('SMP-01', 'builtin:SMP-01:5:4', 'SSOR-005', '航運管理處及其部門及其負責人', '', 5),
    ('SMP-01', 'builtin:SMP-01:6:5', 'SSOR-006', '航運管理處 - 船員組及其負責人', '', 6),
    ('SMP-01', 'builtin:SMP-01:7:6', 'SSOR-007', '航運管理處 - 航運組及其負責人', '', 7),
    ('SMP-01', 'builtin:SMP-01:8:7', 'SSOR-008', '航運管理處 - 海技組及其負責人', '', 8),
    ('SMP-01', 'builtin:SMP-01:9:8', 'SSOR-009', '航運管理處 - 港勤組及其負責人', '', 9),
    ('SMP-01', 'builtin:SMP-01:10:9', 'SSOR-010', '安全衛生處及其負責人', '', 10),
    ('SMP-01', 'builtin:SMP-01:11:10', 'SSOR-011', '管理組及其負責人', '', 11),
    ('SMP-01', 'builtin:SMP-01:12:11', 'SSOR-012', '資材組及其負責人', '', 12),
    ('SMP-01', 'builtin:SMP-01:13:12', 'SSOR-013', '船舶工程處及其人員', '', 13),
    ('SMP-01', 'builtin:SMP-01:14:13', 'SSOR-014', '公司管理審查委員會、應急小組、事故調查小組', '', 14),
    ('SMP-01', 'builtin:SMP-01:15:14', 'SSOR-015', '公司督導', '', 15),
    ('SMP-01', 'builtin:SMP-01:16:15', 'SSOR-016', '公司MLC代表', '', 16),
    ('SMP-01', 'builtin:SMP-01:17:16', 'SSOR-017', '公司保全官', '', 17),
    ('SMP-01', 'builtin:SMP-01:18:17', 'SSOR-018', '公司ISM、ISO、MLC、ISPS管理內部稽核員', '', 18),
    ('SMP-01', 'builtin:SMP-01:19:18', 'SSOR-100', '船舶人員架構和總則', '', 19),
    ('SMP-01', 'builtin:SMP-01:20:19', 'SSOR-101', '船長', '', 20),
    ('SMP-01', 'builtin:SMP-01:21:20', 'SSOR-102', '大副', '', 21),
    ('SMP-01', 'builtin:SMP-01:22:21', 'SSOR-103', '二副', '', 22),
    ('SMP-01', 'builtin:SMP-01:23:22', 'SSOR-104', '三副', '', 23),
    ('SMP-01', 'builtin:SMP-01:24:23', 'SSOR-105', '水手長', '', 24),
    ('SMP-01', 'builtin:SMP-01:25:24', 'SSOR-106', '泵匠', '', 25),
    ('SMP-01', 'builtin:SMP-01:26:25', 'SSOR-107', '木匠', '', 26),
    ('SMP-01', 'builtin:SMP-01:27:26', 'SSOR-108', '值班水手', '', 27),
    ('SMP-01', 'builtin:SMP-01:28:27', 'SSOR-109', '普通水手', '', 28),
    ('SMP-01', 'builtin:SMP-01:29:28', 'SSOR-110', '輪機長', '', 29),
    ('SMP-01', 'builtin:SMP-01:30:29', 'SSOR-111', '大管輪', '', 30),
    ('SMP-01', 'builtin:SMP-01:31:30', 'SSOR-112', '二管輪', '', 31),
    ('SMP-01', 'builtin:SMP-01:32:31', 'SSOR-113', '三管輪', '', 32),
    ('SMP-01', 'builtin:SMP-01:33:32', 'SSOR-114', '銅匠', '', 33),
    ('SMP-01', 'builtin:SMP-01:34:33', 'SSOR-115', '加油、機工', '', 34),
    ('SMP-01', 'builtin:SMP-01:35:34', 'SSOR-116', '電機師', '', 35),
    ('SMP-01', 'builtin:SMP-01:36:35', 'SSOR-117', '冷凍師、液貨冷凍師', '', 36),
    ('SMP-01', 'builtin:SMP-01:37:36', 'SSOR-118', '實習生', '', 37),
    ('SMP-01', 'builtin:SMP-01:38:37', 'SSOR-119', '見習人員', '', 38),
    ('SMP-01', 'builtin:SMP-01:39:38', 'SSOR-120', '大廚和服務生', '', 39),
    ('SMP-01', 'builtin:SMP-01:40:39', 'SSOR-121', '船舶伙食委員會', '', 40),
    ('SMP-01', 'builtin:SMP-01:41:40', 'SSOR-122', '船舶安全委員會、安全官和組員', '', 41),
    ('SMP-01', 'builtin:SMP-01:42:41', 'SSOR-123', '船舶現場協調安全員', '', 42),
    ('SMP-01', 'builtin:SMP-01:43:42', 'SSOR-124', '船舶保全官', '', 43),
    ('SMP-01', 'builtin:SMP-01:44:43', 'SSOR-200', '船岸聯絡報告管理和張貼', '', 44),
    ('SMP-02', 'builtin:SMP-02:1:0', 'HRM-001', '岸基人員管理', '', 1),
    ('SMP-02', 'builtin:SMP-02:2:1', 'HRM-002', '岸基人員交接須知', '', 2),
    ('SMP-02', 'builtin:SMP-02:3:2', 'HRM-100', '船員管理總則', '', 3),
    ('SMP-02', 'builtin:SMP-02:4:3', 'HRM-101', '船員雇傭政策', '', 4),
    ('SMP-02', 'builtin:SMP-02:5:4', 'HRM-102', '船員就業協議管理程序', '', 5),
    ('SMP-02', 'builtin:SMP-02:6:5', 'HRM-104', '船員上、下船管理', '', 6),
    ('SMP-02', 'builtin:SMP-02:7:6', 'HRM-105', '船員的考評、晉升和辭退管理', '', 7),
    ('SMP-02', 'builtin:SMP-02:8:7', 'HRM-106', '船員證書管理', '', 8),
    ('SMP-02', 'builtin:SMP-02:9:8', 'HRM-107', '船員申述、溝通程序', '', 9),
    ('SMP-02', 'builtin:SMP-02:10:9', 'HRM-108', '船員配備和工作語言管理', '', 10),
    ('SMP-03', 'builtin:SMP-03:1:0', 'DCP-001', '安全品質體系管理文件的組成、定義和管理總則', '', 1),
    ('SMP-03', 'builtin:SMP-03:2:1', 'DCP-002', '體系文件名稱、編碼規則和編寫要求', '', 2),
    ('SMP-03', 'builtin:SMP-03:3:2', 'DCP-003', '體系文件的制定、修改和廢止程序', '', 3),
    ('SMP-03', 'builtin:SMP-03:4:3', 'DCP-004', '體系文件的管控要求', '', 4),
    ('SMP-03', 'builtin:SMP-03:5:4', 'DCP-005', '公司通告、通報和辦法的管理', '', 5),
    ('SMP-03', 'builtin:SMP-03:6:5', 'DCP-006', '船舶證書、手冊、出版物管控', '', 6),
    ('SMP-03', 'builtin:SMP-03:7:6', 'DCP-007', '體系文件記錄管控', '', 7),
    ('SMP-03', 'builtin:SMP-03:8:7', 'DCP-008', '法規、規則更新和外部文件管理', '', 8),
    ('SMP-03', 'builtin:SMP-03:9:8', 'DCP-009', '信息的有效傳遞和處理程序', '', 9),
    ('SMP-03', 'builtin:SMP-03:10:9', 'DCP-010', '張貼管理', '', 10),
    ('SMP-03', 'builtin:SMP-03:11:10', 'DCP-011Flow', '系統使用管理', '', 11),
    ('SMP-04', 'builtin:SMP-04:1:0', 'MOC-001', '管理變更程序總則和定義', '', 1),
    ('SMP-04', 'builtin:SMP-04:2:1', 'MOC-002', '變更管理流程', '', 2),
    ('SMP-05', 'builtin:SMP-05:1:0', 'TDP-001', '岸基部門培訓和演習管理總則', '', 1),
    ('SMP-05', 'builtin:SMP-05:2:1', 'TDP-002', '岸基培訓和演習管理細則', '', 2),
    ('SMP-05', 'builtin:SMP-05:3:2', 'TDP-003', '岸基體系培訓要求矩陣', '', 3),
    ('SMP-05', 'builtin:SMP-05:4:3', 'TDP-004', '船員培訓管理', '', 4),
    ('SMP-05', 'builtin:SMP-05:5:4', 'TDP-005', '船員培訓要求矩陣', '', 5),
    ('SMP-05', 'builtin:SMP-05:6:5', 'TDP-006', '訪客熟悉培訓管理', '', 6),
    ('SMP-05', 'builtin:SMP-05:7:6', 'TDP-007', '船舶演習管理總則', '', 7),
    ('SMP-05', 'builtin:SMP-05:8:7', 'TDP-008', '強制性演習、應急演習、保全演習管理細則', '', 8),
    ('SMP-05', 'builtin:SMP-05:9:8', 'TDP-009', '船舶演習矩陣', '', 9),
    ('SMP-06', 'builtin:SMP-06:1:0', 'COE-001', '關鍵性操作和關鍵性設備的管理原則', '', 1),
    ('SMP-06', 'builtin:SMP-06:2:1', 'COE-002', '關鍵性操作清單', '', 2),
    ('SMP-06', 'builtin:SMP-06:3:2', 'COE-003', '關鍵性設備清單', '', 3),
    ('SMP-07', 'builtin:SMP-07:1:0', 'HSER-001', '職業健康安全風險辨識和評價程序', '', 1),
    ('SMP-07', 'builtin:SMP-07:2:1', 'HSER-002', '職業安全風險滾動管理和落實程序', '', 2),
    ('SMP-07', 'builtin:SMP-07:3:2', 'HSER-003', '環境保護管理程序', '', 3),
    ('SMP-07', 'builtin:SMP-07:4:3', 'HSER-004', '環境因素評價及運行控制程序', '', 4),
    ('SMP-08', 'builtin:SMP-08:1:0', 'SAR-001', '船舶檢查總則', '', 1),
    ('SMP-08', 'builtin:SMP-08:2:1', 'SAR-002', '船舶日常、定期、專項自查', '', 2),
    ('SMP-08', 'builtin:SMP-08:3:2', 'SAR-003', '船長查證檢查、船長體系管理複查評審', '', 3),
    ('SMP-08', 'builtin:SMP-08:4:3', 'SAR-004', '岸基訪船、遠程、隨船、專項檢查', '', 4),
    ('SMP-08', 'builtin:SMP-08:5:4', 'SAR-005', '船舶內部稽核', '', 5),
    ('SMP-08', 'builtin:SMP-08:6:5', 'SAR-006', '船舶外部檢查管理', '', 6),
    ('SMP-08', 'builtin:SMP-08:7:6', 'SAR-007', '第三方檢查機構委託檢查管理', '', 7),
    ('SMP-09', 'builtin:SMP-09:1:0', 'CAEM-001', '公司安全管理委員會和月度安全會議制度', '', 1),
    ('SMP-09', 'builtin:SMP-09:2:1', 'CAEM-002', '公司內部稽查', '', 2),
    ('SMP-09', 'builtin:SMP-09:3:2', 'CAEM-003', '公司管理審查委員會和安全管理複查會議', '', 3),
    ('SMP-09', 'builtin:SMP-09:4:3', 'CAEM-004', '公司外部檢查管理程序', '', 4),
    ('SMP-10', 'builtin:SMP-10:1:0', 'DMP-001', '異常管理總則和定義', '', 1),
    ('SMP-10', 'builtin:SMP-10:2:1', 'DMP-002', '一般異常、緊急情況處理流程', '', 2),
    ('SMP-10', 'builtin:SMP-10:3:2', 'DMP-003', '誤報警、隱患處理流程', '', 3),
    ('SMP-10', 'builtin:SMP-10:4:3', 'DMP-004', '觀察項、缺陷、不符合處理流程', '', 4),
    ('SMP-10', 'builtin:SMP-10:5:4', 'DMP-005', '虛驚、事故處理流程', '', 5),
    ('SMP-10', 'builtin:SMP-10:6:5', 'DMP-006', '向公司及主管機關報告管理程序', '', 6),
    ('SMP-10', 'builtin:SMP-10:7:6', 'DMP-007', '異常調查指南', '', 7),
    ('SMP-11', 'builtin:SMP-11:1:0', 'CEP-001', '流程圖', '', 1),
    ('SMP-11', 'builtin:SMP-11:2:1', 'CEP-002', '緊急對策小組', '', 2),
    ('SMP-11', 'builtin:SMP-11:3:2', 'CEP-003', '應急中心與設備', '', 3),
    ('SMP-11', 'builtin:SMP-11:4:3', 'CEP-004', '聯繫', '', 4),
    ('SMP-11', 'builtin:SMP-11:5:4', 'CEP-005', '公司應急對策報告', '', 5),
    ('SMP-11', 'builtin:SMP-11:6:5', 'CEP-006', '公司應急對策計畫', '', 6),
    ('SMP-11', 'builtin:SMP-11:7:6', 'CEP-007', '相關工作指導書', '', 7),
    ('SMP-11', 'builtin:SMP-11:8:7', 'CEP-008', '相關紀錄', '', 8),
    ('SMP-12', 'builtin:SMP-12:1:0', 'TPC-001', '第三方管理總則', '', 1),
    ('SMP-12', 'builtin:SMP-12:2:1', 'TPC-002', '船員勞務管理公司管理程序', '', 2),
    ('SMP-12', 'builtin:SMP-12:3:2', 'TPC-051', '埃克森美孚符合性管理程序', '', 3),
    ('SMI-01', 'builtin:SMI-01:1:0', 'SHM-001', '有害物質管理須知', '', 1),
    ('SMI-01', 'builtin:SMI-01:2:1', 'SHM-002', '職業暴露限值管控須知', '', 2),
    ('SMI-01', 'builtin:SMI-01:3:2', 'SHM-003', '安全數據表物質安全數據表', '', 3),
    ('SMI-01', 'builtin:SMI-01:4:3', 'SHM-004', '人員安全防護管理須知', '', 4),
    ('SMI-01', 'builtin:SMI-01:5:4', 'SHM-100', '在船工作休息時間管理須知', '', 5),
    ('SMI-01', 'builtin:SMI-01:6:5', 'SHM-101', '船員行為規範守則', '', 6),
    ('SMI-01', 'builtin:SMI-01:7:6', 'SHM-102', '船上禁戒、酒精和藥品控制須知', '', 7),
    ('SMI-01', 'builtin:SMI-01:8:7', 'SHM-103', '船員身心健康管理須知', '', 8),
    ('SMI-01', 'builtin:SMI-01:9:8', 'SHM-104', '船用藥品與醫療器械管理須知', '', 9),
    ('SMI-01', 'builtin:SMI-01:10:9', 'SHM-105', '船員傷病、流行病和死亡管理須知', '', 10),
    ('SMI-01', 'builtin:SMI-01:11:10', 'SHM-106', '船員工傷事故報告須知', '', 11),
    ('SMI-01', 'builtin:SMI-01:12:11', 'SHM-107', '船舶衛生內務及膳食管理須知', '', 12),
    ('SMI-01', 'builtin:SMI-01:13:12', 'SHM-108', '船員獎金、津貼和福利管理須知', '', 13),
    ('SMI-01', 'builtin:SMI-01:14:13', 'SHM-109', '船員防騷擾、霸淩管理須知', '', 14),
    ('SMI-01', 'builtin:SMI-01:15:14', 'SHM-110', '船舶飲用水管理須知', '', 15),
    ('SMI-01', 'builtin:SMI-01:16:15', 'SHM-', '附件-01 ISF Watchkeeper 使用說明', '', 16),
    ('SMI-02', 'builtin:SMI-02:1:0', 'SOI-001', '工作計劃、工前會議和準備、工作監控管理須知', '', 1),
    ('SMI-02', 'builtin:SMI-02:2:1', 'SOI-002', '船舶安全會議', '', 2),
    ('SMI-02', 'builtin:SMI-02:3:2', 'SOI-003', '同時作業管理', '', 3),
    ('SMI-02', 'builtin:SMI-02:4:3', 'SOI-004', '停止作業程序', '', 4),
    ('SMI-02', 'builtin:SMI-02:5:4', 'SOI-005', '危險能量控制', '', 5),
    ('SMI-02', 'builtin:SMI-02:6:5', 'SOI-006', '船舶防火防爆管理須知', '', 6),
    ('SMI-02', 'builtin:SMI-02:7:6', 'SOI-007', '動力工具安全須知', '', 7),
    ('SMI-02', 'builtin:SMI-02:8:7', 'SOI-008', '起吊設備安全須知', '', 8),
    ('SMI-02', 'builtin:SMI-02:9:8', 'SOI-009', '船舶在低溫和高溫環境中的注意須知', '', 9),
    ('SMI-02', 'builtin:SMI-02:10:9', 'SOI-010', '船舶防抗台須知', '', 10),
    ('SMI-02', 'builtin:SMI-02:11:10', 'SOI-011', '船舶在惡劣天氣下安全作業須知', '', 11),
    ('SMI-02', 'builtin:SMI-02:12:11', 'SOI-012', '船舶通道及甲板防滑和防跌倒須知', '', 12),
    ('SMI-02', 'builtin:SMI-02:13:12', 'SOI-013', '船舶安全標誌和操作說明張貼須知', '', 13),
    ('SMI-02', 'builtin:SMI-02:14:13', 'SOI-014', '船舶水密、通道管理須知', '', 14),
    ('SMI-02', 'builtin:SMI-02:15:14', 'SOI-015', '油漆間、化學品存放處管理須知', '', 15),
    ('SMI-02', 'builtin:SMI-02:16:15', 'SOI-0100', '抗辯書須知（LOP）', '', 16),
    ('SMI-02', 'builtin:SMI-02:17:16', 'SOI-0101', '事實陳述書須知（SOF）', '', 17),
    ('SMI-02', 'builtin:SMI-02:18:17', 'SOI-', '附件-01 船舶防抗台預案', '', 18),
    ('SMI-02', 'builtin:SMI-02:19:18', 'SOI-', '附件-02 船舶作業常見危害類型', '', 19),
    ('SMI-03', 'builtin:SMI-03:1:0', 'PTW-001', '工作許可證制度總則', '', 1),
    ('SMI-03', 'builtin:SMI-03:2:1', 'PTW-002', '熱工作業', '', 2),
    ('SMI-03', 'builtin:SMI-03:3:2', 'PTW-003', '密閉、受限空間作業', '', 3),
    ('SMI-03', 'builtin:SMI-03:4:3', 'PTW-004', '冷工作業', '', 4),
    ('SMI-03', 'builtin:SMI-03:5:4', 'PTW-005', '高空及舷外作業', '', 5),
    ('SMI-03', 'builtin:SMI-03:6:5', 'PTW-006', '電氣設備及電路作業', '', 6),
    ('SMI-03', 'builtin:SMI-03:7:6', 'PTW-007', '壓力管路和容器作業', '', 7),
    ('SMI-03', 'builtin:SMI-03:8:7', 'PTW-008', '小船掛靠許可', '', 8),
    ('SMI-03', 'builtin:SMI-03:9:8', 'PTW-009', '水下作業', '', 9),
    ('SMI-03', 'builtin:SMI-03:10:9', 'PTW-010', '吊重作業許可', '', 10),
    ('SMI-03', 'builtin:SMI-03:11:10', 'PTW-011', '惡劣天候下甲板作業', '', 11),
    ('SMI-03', 'builtin:SMI-03:12:11', 'PTW-012', '關鍵性設備關停、離線作業管控', '', 12),
    ('SMI-04', 'builtin:SMI-04:1:0', 'RAP-001', '1 引言', '', 1),
    ('SMI-04', 'builtin:SMI-04:2:1', 'RAP-002', '2 定義', '', 2),
    ('SMI-04', 'builtin:SMI-04:3:2', 'RAP-003', '3 目的', '', 3),
    ('SMI-04', 'builtin:SMI-04:4:3', 'RAP-004', '4 危險的辨識', '', 4),
    ('SMI-04', 'builtin:SMI-04:5:4', 'RAP-005', '5 評估', '', 5),
    ('SMI-04', 'builtin:SMI-04:6:5', 'RAP-006', '6 公司對特定的活動須做風險評估', '', 6),
    ('SMI-04', 'builtin:SMI-04:7:6', 'RAP-007', '7 船上工作的風險評估', '', 7),
    ('SMI-04', 'builtin:SMI-04:8:7', 'RAP-008', '8 風險評估訓練', '', 8),
    ('SMI-04', 'builtin:SMI-04:9:8', 'RAP-009', '9 風險評估之結論', '', 9),
    ('SMI-04', 'builtin:SMI-04:10:9', 'RAP-010', '10 風險評估流程圖', '', 10),
    ('SMI-04', 'builtin:SMI-04:11:10', 'RAP-011', '11 相關紀錄', '', 11),
    ('SMI-05', 'builtin:SMI-05:1:0', 'SWO-001', '船長常規命令和日常命令須知（含電子海圖常規命令）', '', 1),
    ('SMI-05', 'builtin:SMI-05:2:1', 'SWO-002', '呼叫船長', '', 2),
    ('SMI-05', 'builtin:SMI-05:3:2', 'SWO-003', '駕駛台值班和瞭望', '', 3),
    ('SMI-05', 'builtin:SMI-05:4:3', 'SWO-004', '配備電子海圖顯示與信息系統船舶當值須知', '', 4),
    ('SMI-05', 'builtin:SMI-05:5:4', 'SWO-005', '船舶無線電值守須知（含GMDSS無線電記錄簿）', '', 5),
    ('SMI-05', 'builtin:SMI-05:6:5', 'SWO-006', '船舶通訊管理（含遇險、緊急與安全通信）', '', 6),
    ('SMI-05', 'builtin:SMI-05:7:6', 'SWO-007', '駕駛台交接班和安全巡邏', '', 7),
    ('SMI-05', 'builtin:SMI-05:8:7', 'SWO-008', '駕駛台防干擾和防分心須知', '', 8),
    ('SMI-05', 'builtin:SMI-05:9:8', 'SWO-009', '駕駛台警報管理須知', '', 9),
    ('SMI-05', 'builtin:SMI-05:10:9', 'SWO-010', '將引航員納入駕駛台團隊的程序', '', 10),
    ('SMI-05', 'builtin:SMI-05:11:10', 'SWO-011', '甲板航海日誌、車鐘記錄簿和相關記錄', '', 11),
    ('SMI-05', 'builtin:SMI-05:12:11', 'SWO-012', '紙質海圖與航海出版物管理須知', '', 12),
    ('SMI-05', 'builtin:SMI-05:13:12', 'SWO-020', '航行計劃', '', 13),
    ('SMI-05', 'builtin:SMI-05:14:13', 'SWO-021', '船舶富餘水深規定', '', 14),
    ('SMI-05', 'builtin:SMI-05:15:14', 'SWO-022', '船舶定位須知', '', 15),
    ('SMI-05', 'builtin:SMI-05:16:15', 'SWO-023', '船舶報告須知', '', 16),
    ('SMI-05', 'builtin:SMI-05:17:16', 'SWO-100', '機艙當值指南', '', 17),
    ('SMI-05', 'builtin:SMI-05:18:17', 'SWO-101', '輪機長常規命令與每日命令', '', 18),
    ('SMI-05', 'builtin:SMI-05:19:18', 'SWO-102', '值班配置與巡視', '', 19),
    ('SMI-05', 'builtin:SMI-05:20:19', 'SWO-103', '燃油更換程序指南', '', 20),
    ('SMI-05', 'builtin:SMI-05:21:20', 'SWO-104', '加油作業須知', '', 21),
    ('SMI-05', 'builtin:SMI-05:22:21', 'SWO-105', '燃油、潤滑油、液壓油定期分析須知', '', 22),
    ('SMI-05', 'builtin:SMI-05:23:22', 'SWO-200', '甲板部和機艙部溝通須知', '', 23),
    ('SMI-05', 'builtin:SMI-05:24:23', 'SWO-201', '機駕備便狀態', '', 24),
    ('SMI-05', 'builtin:SMI-05:25:24', 'SWO-202', '進出港作業須知', '', 25),
    ('SMI-05', 'builtin:SMI-05:26:25', 'SWO-203', '系離泊作業須知', '', 26),
    ('SMI-05', 'builtin:SMI-05:27:26', 'SWO-204', '錨泊作業須知', '', 27),
    ('SMI-05', 'builtin:SMI-05:28:27', 'SWO-205', '漂航須知', '', 28),
    ('SMI-05', 'builtin:SMI-05:29:28', 'SWO-206', '單點繫泊作業須知', '', 29),
    ('SMI-05', 'builtin:SMI-05:30:29', 'SWO-207', '船對船靠、離、操縱作業須知', '', 30),
    ('SMI-05', 'builtin:SMI-05:31:30', 'SWO-208', '直升機作業須知', '', 31),
    ('SMI-05', 'builtin:SMI-05:32:31', 'SWO-209', '輔助小船作業及其風險須知', '', 32),
    ('SMI-05', 'builtin:SMI-05:33:32', 'SWO-220', '限制水域、近陸區域及狹水道航行須知', '', 33),
    ('SMI-05', 'builtin:SMI-05:34:33', 'SWO-221', '寒冷天氣和冰區航行須知', '', 34),
    ('SMI-05', 'builtin:SMI-05:35:34', 'SWO-222', '能見度不良時安全航行須知', '', 35),
    ('SMI-05', 'builtin:SMI-05:36:35', 'SWO-223', '大風浪中船舶操縱須知', '', 36),
    ('SMI-05', 'builtin:SMI-05:37:36', 'SWO-224', '船舶搜救須知', '', 37),
    ('SMI-05', 'builtin:SMI-05:38:37', 'SWO-300', '大副常規命令須知', '', 38),
    ('SMI-05', 'builtin:SMI-05:39:38', 'SWO-301', '甲板在港當值和巡查須知', '', 39),
    ('SMI-05', 'builtin:SMI-05:40:39', 'SWO-302', '進入船舶通道控制須知', '', 40),
    ('SMI-05', 'builtin:SMI-05:41:40', 'SWO-303', '甲板錨泊值班和巡查須知', '', 41),
    ('SMI-05', 'builtin:SMI-05:42:41', 'SWO-320', '帶纜作業及其風險須知', '', 42),
    ('SMI-05', 'builtin:SMI-05:43:42', 'SWO-321', '登離船佈置須知', '', 43),
    ('SMI-05', 'builtin:SMI-05:44:43', 'SWO-322', '海上吊車轉移人員操作須知', '', 44),
    ('SMI-05', 'builtin:SMI-05:45:44', 'SWO-', '附件-01 船長海上當值常規命令指導', '', 45),
    ('SMI-05', 'builtin:SMI-05:46:45', 'SWO-', '附件-02 船長在港當值常規命令指導', '', 46),
    ('SMI-05', 'builtin:SMI-05:47:46', 'SWO-', '附件-03 船長電子海圖常規命令指導', '', 47),
    ('SMI-05', 'builtin:SMI-05:48:47', 'SWO-', '附件-04 大副常規命令', '', 48),
    ('SMI-05', 'builtin:SMI-05:49:48', 'SWO-', '附件-05 駕駛台航行當值編組表', '', 49),
    ('SMI-05', 'builtin:SMI-05:50:49', 'SWO-', '附件-06 輪機人員當值編組表', '', 50),
    ('SMI-05', 'builtin:SMI-05:51:50', 'SWO-', '附件-07 甲板人員當值編組表', '', 51),
    ('SMI-05', 'builtin:SMI-05:52:51', 'SWO-', '附件-08 輪機長海上當值常規命令指導', '', 52),
    ('SMI-05', 'builtin:SMI-05:53:52', 'SWO-', '附件-09 輪機長在港當值常規命令指導', '', 53),
    ('SMI-05', 'builtin:SMI-05:54:53', 'SWO-', '附件-10 接收到高頻數位選擇呼叫遇險警報應採取行動', '', 54),
    ('SMI-05', 'builtin:SMI-05:55:54', 'SWO-', '附件-11 接收到特高頻、中頻數位選擇呼叫遇險警報應採取行動', '', 55),
    ('SMI-05', 'builtin:SMI-05:56:55', 'SWO-', '附件-12 GMDSS操作指南', '', 56),
    ('SMI-05', 'builtin:SMI-05:57:56', 'SWO-', '附件-13 GMDSS遇險通信程序', '', 57),
    ('SMI-05', 'builtin:SMI-05:58:57', 'SWO-', '附件-14 遇險警報指南', '', 58),
    ('SMI-05', 'builtin:SMI-05:59:58', 'SWO-', '附件-20 航行警告電傳岸台發射示意圖', '', 59),
    ('SMI-05', 'builtin:SMI-05:60:59', 'SWO-', '附件-21 航路指南覆蓋範圍示意圖', '', 60),
    ('SMI-05', 'builtin:SMI-05:61:60', 'SWO-', '附件-31 引航員轉移安排要求示意圖', '', 61),
    ('SMI-05', 'builtin:SMI-05:62:61', 'SWO-', '附件-32 船舶通過巴拿馬運河作業辦法', '', 62),
    ('SMI-05', 'builtin:SMI-05:63:62', 'SWO-', '附件-101 換油計算器說明書', '', 63),
    ('SMI-05', 'builtin:SMI-05:64:63', 'SWO-', '附件-102 換油計算器', '', 64),
    ('SMI-06', 'builtin:SMI-06:1:0', 'CHP-001', '貨物操作程序概述', '', 1),
    ('SMI-06', 'builtin:SMI-06:2:1', 'CHP-002', '貨物操作職責手冊', '', 2),
    ('SMI-06', 'builtin:SMI-06:3:2', 'CHP-003', '液體貨物的密度，比重，膨脹系數及蒸氣壓', '', 3),
    ('SMI-06', 'builtin:SMI-06:4:3', 'CHP-004', '液體貨物的熔點、凝點、粘度、固化貨物、水溶性、沸點和蒸氣密度', '', 4),
    ('SMI-06', 'builtin:SMI-06:5:4', 'CHP-005', '液體貨物的易燃性、毒性和致癌性', '', 5),
    ('SMI-06', 'builtin:SMI-06:6:5', 'CHP-006', '苯和其他芳香烴的危害及預防措施', '', 6),
    ('SMI-06', 'builtin:SMI-06:7:6', 'CHP-007', '硫化氫的危害及預防措施', '', 7),
    ('SMI-06', 'builtin:SMI-06:8:7', 'CHP-008', '靜電及其危害', '', 8),
    ('SMI-06', 'builtin:SMI-06:9:8', 'CHP-009', '惰性氣體（包括氮氣）的用途、危害及預防措施', '', 9),
    ('SMI-06', 'builtin:SMI-06:10:9', 'CHP-050', '裝運通知', '', 10),
    ('SMI-06', 'builtin:SMI-06:11:10', 'CHP-051', '準備就緒通知書', '', 11),
    ('SMI-06', 'builtin:SMI-06:12:11', 'CHP-052', '貨物作業抗辯書、事實聲明', '', 12),
    ('SMI-06', 'builtin:SMI-06:13:12', 'CHP-053', '泵間管理', '', 13),
    ('SMI-06', 'builtin:SMI-06:14:13', 'CHP-054', '船岸安全檢查表須知', '', 14),
    ('SMI-06', 'builtin:SMI-06:15:14', 'CHP-054SSSCL', '須知 Instructions for SSSCL', '', 15),
    ('SMI-06', 'builtin:SMI-06:16:15', 'CHP-055', '船舶穩性、強度管理', '', 16),
    ('SMI-06', 'builtin:SMI-06:17:16', 'CHP-056', '甲板作業記錄要求', '', 17),
    ('SMI-06', 'builtin:SMI-06:18:17', 'CHP-057', '閥門的開關操作和防衝擊', '', 18),
    ('SMI-06', 'builtin:SMI-06:19:18', 'CHP-058', '向貨物中添加物質', '', 19),
    ('SMI-06', 'builtin:SMI-06:20:19', 'CHP-059', '貨艙開口緊固', '', 20),
    ('SMI-06', 'builtin:SMI-06:21:20', 'CHP-060', '大氣測量須知', '', 21),
    ('SMI-06', 'builtin:SMI-06:22:21', 'CHP-061', '船靠船駁貨作業', '', 22),
    ('SMI-06', 'builtin:SMI-06:23:22', 'CHP-062', '艙壓管理', '', 23),
    ('SMI-06', 'builtin:SMI-06:24:23', 'CHP-063', '貨物操作時壓載管理', '', 24),
    ('SMI-06', 'builtin:SMI-06:25:24', 'CHP-064', '荒天壓載', '', 25),
    ('SMI-06', 'builtin:SMI-06:26:25', 'CHP-065', '貨艙溫度管理', '', 26),
    ('SMI-06', 'builtin:SMI-06:27:26', 'CHP-066', '貨泵及其操作', '', 27),
    ('SMI-06', 'builtin:SMI-06:28:27', 'CHP-070', '停止和應急處理', '', 28),
    ('SMI-06', 'builtin:SMI-06:29:28', 'CHP-100AnnexI', '油類貨物配載須知', '', 29),
    ('SMI-06', 'builtin:SMI-06:30:29', 'CHP-101', '貨物操作指導手冊書籍熟悉 -Annex I', '', 30),
    ('SMI-06', 'builtin:SMI-06:31:30', 'CHP-102', '靠泊前貨物操作準備須知 -Annex I', '', 31),
    ('SMI-06', 'builtin:SMI-06:32:31', 'CHP-103', '靠泊後貨物操作準備 -Annex I', '', 32),
    ('SMI-06', 'builtin:SMI-06:33:32', 'CHP-104', '裝卸貨計劃 -Annex I', '', 33),
    ('SMI-06', 'builtin:SMI-06:34:33', 'CHP-105', '量艙和取樣作業 -Annex I', '', 34),
    ('SMI-06', 'builtin:SMI-06:35:34', 'CHP-106', '驗艙／貨品數量／貨品質量 -Annex I', '', 35),
    ('SMI-06', 'builtin:SMI-06:36:35', 'CHP-107', '管線和貨物作業就緒準備 -Annex I', '', 36),
    ('SMI-06', 'builtin:SMI-06:37:36', 'CHP-108', '裝貨作業-Annex I', '', 37),
    ('SMI-06', 'builtin:SMI-06:38:37', 'CHP-109', '吹管、岸線沖洗 -Annex I', '', 38),
    ('SMI-06', 'builtin:SMI-06:39:38', 'CHP-110', '拆接管和放殘作業 -Annex I', '', 39),
    ('SMI-06', 'builtin:SMI-06:40:39', 'CHP-111', '航程中的貨物照料 -Annex I', '', 40),
    ('SMI-06', 'builtin:SMI-06:41:40', 'CHP-112', '內部駁貨作業須知 -Annex I', '', 41),
    ('SMI-06', 'builtin:SMI-06:42:41', 'CHP-113', '卸貨作業須知Annex I', '', 42),
    ('SMI-06', 'builtin:SMI-06:43:42', 'CHP-114', '原油洗艙作業須知', '', 43),
    ('SMI-06', 'builtin:SMI-06:44:43', 'CHP-115', '洗艙作業須知 -Annex I', '', 44),
    ('SMI-06', 'builtin:SMI-06:45:44', 'CHP-116', '殘油、洗艙水與殘渣的處置 -Annex I', '', 45),
    ('SMI-06', 'builtin:SMI-06:46:45', 'CHP-117', '驅氣／置換作業 -Annex I', '', 46),
    ('SMI-06', 'builtin:SMI-06:47:46', 'CHP-118', '除氣和通風 -Annex I', '', 47),
    ('SMI-06', 'builtin:SMI-06:48:47', 'CHP-119', '入艙清艙作業須知 -Annex I', '', 48),
    ('SMI-06', 'builtin:SMI-06:49:48', 'CHP-120', '充惰作業 -Annex I', '', 49),
    ('SMI-06', 'builtin:SMI-06:50:49', 'CHP-200AnnexII', '化學品類貨物配載須知 -Annex II', '', 50),
    ('SMI-06', 'builtin:SMI-06:51:50', 'CHP-201', '不熟悉貨物或新貨物的操作須知 -Annex II', '', 51),
    ('SMI-06', 'builtin:SMI-06:52:51', 'CHP-202', '液體貨物的反應性和相容性 -Annex II', '', 52),
    ('SMI-06', 'builtin:SMI-06:53:52', 'CHP-203USCG', '相容表及引用法規 -Annex II', '', 53),
    ('SMI-06', 'builtin:SMI-06:54:53', 'CHP-204', '程序與佈置手冊、貨物操作手冊、MEPC.2通函 -Annex II', '', 54),
    ('SMI-06', 'builtin:SMI-06:55:54', 'CHP-205', '靠泊前貨物操作準備須知 -Annex II', '', 55),
    ('SMI-06', 'builtin:SMI-06:56:55', 'CHP-206', '靠泊後貨物操作準備 -Annex II', '', 56),
    ('SMI-06', 'builtin:SMI-06:57:56', 'CHP-207', '裝卸貨計劃 -Annex II', '', 57),
    ('SMI-06', 'builtin:SMI-06:58:57', 'CHP-208', '封閉裝卸作業須知 -Annex II', '', 58),
    ('SMI-06', 'builtin:SMI-06:59:58', 'CHP-209', '量艙和取樣作業 -Annex II', '', 59),
    ('SMI-06', 'builtin:SMI-06:60:59', 'CHP-210', '驗艙／貨品數量／貨品質量 -Annex II', '', 60),
    ('SMI-06', 'builtin:SMI-06:61:60', 'CHP-211', '管線和貨物作業就緒準備 -Annex II', '', 61),
    ('SMI-06', 'builtin:SMI-06:62:61', 'CHP-212', '裝貨作業 -Annex II', '', 62),
    ('SMI-06', 'builtin:SMI-06:63:62', 'CHP-213', '吹管、清管 -Annex II', '', 63),
    ('SMI-06', 'builtin:SMI-06:64:63', 'CHP-214', '拆接管和放殘作業 -Annex II', '', 64),
    ('SMI-06', 'builtin:SMI-06:65:64', 'CHP-215', '航程中的貨物照料 -Annex II', '', 65),
    ('SMI-06', 'builtin:SMI-06:66:65', 'CHP-216', '內部駁貨操作 -Annex II', '', 66),
    ('SMI-06', 'builtin:SMI-06:67:66', 'CHP-217', '卸貨作業 -Annex II', '', 67),
    ('SMI-06', 'builtin:SMI-06:68:67', 'CHP-218', '預洗作業須知 -Annex II', '', 68),
    ('SMI-06', 'builtin:SMI-06:69:68', 'CHP-219', '洗艙作業 -Annex II', '', 69),
    ('SMI-06', 'builtin:SMI-06:70:69', 'CHP-220', '通風淨艙 -Annex II', '', 70),
    ('SMI-06', 'builtin:SMI-06:71:70', 'CHP-221', '洗艙水、殘液的處置 -Annex II', '', 71),
    ('SMI-06', 'builtin:SMI-06:72:71', 'CHP-222', '洗艙藥劑使用須知 -Annex II', '', 72),
    ('SMI-06', 'builtin:SMI-06:73:72', 'CHP-223', '驅氣、填封／氮封、乾燥 -Annex II', '', 73),
    ('SMI-06', 'builtin:SMI-06:74:73', 'CHP-224', '除氣和通風 -Annex II', '', 74),
    ('SMI-06', 'builtin:SMI-06:75:74', 'CHP-225', '入艙清艙作業須知 -Annex II', '', 75),
    ('SMI-06', 'builtin:SMI-06:76:75', 'CHP-226', '艙壁檢驗作業須知 -Annex II', '', 76),
    ('SMI-06', 'builtin:SMI-06:77:76', 'CHP-227', '惰化作業須知 -Annex II', '', 77),
    ('SMI-06', 'builtin:SMI-06:78:77', 'CHP-228', '從岸上接收氮氣須知 -Annex II', '', 78),
    ('SMI-06', 'builtin:SMI-06:79:78', 'CHP-250', '裝載腐蝕性貨物 -Annex II', '', 79),
    ('SMI-06', 'builtin:SMI-06:80:79', 'CHP-251', '裝載高粘度貨和易固化貨物 -Annex II', '', 80),
    ('SMI-06', 'builtin:SMI-06:81:80', 'CHP-252', '裝載加熱貨和冷卻貨物 -Annex II', '', 81),
    ('SMI-06', 'builtin:SMI-06:82:81', 'CHP-253', '裝載高比重貨物 -Annex II', '', 82),
    ('SMI-06', 'builtin:SMI-06:83:82', 'CHP-254', '裝載含抑制劑的貨物 -Annex II', '', 83),
    ('SMI-06', 'builtin:SMI-06:84:83', 'CHP-301', '散裝貨物類型，其危害與預防措施 -Bulk', '', 84),
    ('SMI-06', 'builtin:SMI-06:85:84', 'CHP-302', '裝載手冊和算貨電腦的使用 -Bulk', '', 85),
    ('SMI-06', 'builtin:SMI-06:86:85', 'CHP-303', '裝運通知與配載須知 -Bulk', '', 86),
    ('SMI-06', 'builtin:SMI-06:87:86', 'CHP-321', '備艙須知 -Bulk', '', 87),
    ('SMI-06', 'builtin:SMI-06:88:87', 'CHP-322', '掃艙、洗艙作業須知 -Bulk', '', 88),
    ('SMI-06', 'builtin:SMI-06:89:88', 'CHP-323', '準備就緒通知書 -Bulk', '', 89),
    ('SMI-06', 'builtin:SMI-06:90:89', 'CHP-324', '壓載航程須知 -Bulk', '', 90),
    ('SMI-06', 'builtin:SMI-06:91:90', 'CHP-325', '設計為可壓載的貨艙壓排載須知 -Bulk', '', 91),
    ('SMI-06', 'builtin:SMI-06:92:91', 'CHP-326', '靠泊前貨物操作準備須知 -Bulk', '', 92),
    ('SMI-06', 'builtin:SMI-06:93:92', 'CHP-327', '裝貨作業須知 -Bulk', '', 93),
    ('SMI-06', 'builtin:SMI-06:94:93', 'CHP-328', '裝載航程中貨物照料須知 -Bulk', '', 94),
    ('SMI-06', 'builtin:SMI-06:95:94', 'CHP-329', '卸貨作業須知 -Bulk', '', 95),
    ('SMI-06', 'builtin:SMI-06:96:95', 'CHP-330', '裝卸貨作業期間人員下艙須知 -Bulk', '', 96),
    ('SMI-06', 'builtin:SMI-06:97:96', 'CHP-331', '貨物短缺、索賠與爭議 -Bulk', '', 97),
    ('SMI-06', 'builtin:SMI-06:98:97', 'CHP-350', '煤炭', '', 98),
    ('SMI-06', 'builtin:SMI-06:99:98', 'CHP-351', '穀類装载', '', 99),
    ('SMI-06', 'builtin:SMI-06:100:99', 'CHP-352', '礦砂装载', '', 100),
    ('SMI-06', 'builtin:SMI-06:101:100', 'CHP-353', '散雜货', '', 101),
    ('SMI-07', 'builtin:SMI-07:1:0', 'EPP-001', '垃圾及垃圾記薄管理須知', '', 1),
    ('SMI-07', 'builtin:SMI-07:2:1', 'EPP-002', '醫療廢棄物、過期危險品處理須知', '', 2),
    ('SMI-07', 'builtin:SMI-07:3:2', 'EPP-003', '船舶生活污水管控須知', '', 3),
    ('SMI-07', 'builtin:SMI-07:4:3', 'EPP-004', '壓載水及壓載水記錄簿管理須知', '', 4),
    ('SMI-07', 'builtin:SMI-07:5:4', 'EPP-005', '船舶能耗管理', '', 5),
    ('SMI-07', 'builtin:SMI-07:6:5', 'EPP-006', '船上焚燒管控須知', '', 6),
    ('SMI-07', 'builtin:SMI-07:7:6', 'EPP-007', '防止燃油污染-油料紀錄簿（第一部分）', '', 7),
    ('SMI-07', 'builtin:SMI-07:8:7', 'EPP-008MARPOLAnnexI&II', '記錄簿及洗艙水管理', '', 8),
    ('SMI-07', 'builtin:SMI-07:9:8', 'EPP-009', '燃油樣品管理須知', '', 9),
    ('SMI-07', 'builtin:SMI-07:10:9', 'EPP-010', '貨物樣品管理須知', '', 10),
    ('SMI-07', 'builtin:SMI-07:11:10', 'EPP-011', '維護甲板圍堰完整性與排水閥使用程序', '', 11),
    ('SMI-07', 'builtin:SMI-07:12:11', 'EPP-012', '消耗臭氧物質管控須知', '', 12),
    ('SMI-07', 'builtin:SMI-07:13:12', 'EPP-013', '氮化物排放管控須知', '', 13),
    ('SMI-07', 'builtin:SMI-07:14:13', 'EPP-014', '硫化物排放管控須知', '', 14),
    ('SMI-07', 'builtin:SMI-07:15:14', 'EPP-015', '主機功率限制器', '', 15),
    ('SMI-07', 'builtin:SMI-07:16:15', 'EPP-', '附件-01 美國壓載水申報指南', '', 16),
    ('SMI-07', 'builtin:SMI-07:17:16', 'EPP-', '附件-02 加拿大壓載水申報指南', '', 17),
    ('SMI-07', 'builtin:SMI-07:18:17', 'EPP-', '附件-03 澳大利亞壓載水申報指南', '', 18),
    ('SMI-07', 'builtin:SMI-07:19:18', 'EPP-', '附件-04 壓載水記錄簿填寫指南', '', 19),
    ('SMI-07', 'builtin:SMI-07:20:19', 'EPP-', '附件-05 貨物記錄簿填寫範本', '', 20),
    ('SMI-07', 'builtin:SMI-07:21:20', 'EPP-', '附件-05 Appendix-05 Filling Template for Cargo Record Book', '', 21),
    ('SMI-08', 'builtin:SMI-08:1:0', 'OMG-001', '船舶和設備維護總則和PMS系統', '', 1),
    ('SMI-08', 'builtin:SMI-08:2:1', 'OMG-002', '船舶維護保養責任制', '', 2),
    ('SMI-08', 'builtin:SMI-08:3:2', 'OMG-003', '船舶及設備檢修、養護分工明細表', '', 3),
    ('SMI-08', 'builtin:SMI-08:4:3', 'OMG-004', '船舶進廠修理、保養和改建管理須知', '', 4),
    ('SMI-08', 'builtin:SMI-08:5:4', 'OMG-005', '船舶設備和系統操作規程編制須知', '', 5),
    ('SMI-08', 'builtin:SMI-08:6:5', 'OMG-006', '滅火系統維護保養總則', '', 6),
    ('SMI-08', 'builtin:SMI-08:7:6', 'OMG-007', '安全、應急設備維護保養總則', '', 7),
    ('SMI-08', 'builtin:SMI-08:8:7', 'OMG-008', '救生設備維護保養總則', '', 8),
    ('SMI-08', 'builtin:SMI-08:9:8', 'OMG-009', '船舶通信導航設備維護總則', '', 9),
    ('SMI-08', 'builtin:SMI-08:10:9', 'OMG-010', '貨艙、壓載艙、油艙及其他船艙維護監控總則', '', 10),
    ('SMI-08', 'builtin:SMI-08:11:10', 'OMG-011', '本質安全和防爆電器設備維護總則', '', 11),
    ('SMI-08', 'builtin:SMI-08:12:11', 'OMG-012', '船舶備件、專用工具管理總則', '', 12),
    ('SMI-08', 'builtin:SMI-08:13:12', 'OMG-013', '液壓設備維護總則', '', 13),
    ('SMI-08', 'builtin:SMI-08:14:13', 'OMG-014', '繫泊設備和錨設備維護總則', '', 14),
    ('SMI-08', 'builtin:SMI-08:15:14', 'OMG-015', '量測儀器維護總則', '', 15),
    ('SMI-08', 'builtin:SMI-08:16:15', 'OMG-016', '機艙警報測試與管理總則', '', 16),
    ('SMI-08', 'builtin:SMI-08:17:16', 'OMG-020', '關鍵性設備維護及其關鍵性備件管理總則', '', 17),
    ('SMI-08', 'builtin:SMI-08:18:17', 'OMG-021', '船舶檢驗管理須知', '', 18),
    ('SMI-08', 'builtin:SMI-08:19:18', 'OMG-022', '船舶設備與檢驗延期風險審查程序', '', 19),
    ('SMI-08', 'builtin:SMI-08:20:19', 'OMG-102', '不銹鋼艙室鈍化操作', '', 20),
    ('SMI-08', 'builtin:SMI-08:21:20', 'OMG-104', '船舶管路、軟管、閥門、異徑管及其附屬船舶管路、閥門、異徑管、可拆卸短管、防噴濺罩及其附屬', '', 21),
    ('SMI-08', 'builtin:SMI-08:22:21', 'OMG-110', '散貨艙口蓋的操作和維護手冊', '', 22),
    ('SMI-08', 'builtin:SMI-08:23:22', 'OMG-201', '自給式呼吸器（SCBA）&緊急逃生呼吸裝置（EEBD）', '', 23),
    ('SMI-08', 'builtin:SMI-08:24:23', 'OMG-202', '便攜式測氧測爆測毒儀及校正氣體', '', 24),
    ('SMI-08', 'builtin:SMI-08:25:24', 'OMG-203', '固定式氣體探測系統', '', 25),
    ('SMI-08', 'builtin:SMI-08:26:25', 'OMG-204', '酒精測試儀', '', 26),
    ('SMI-08', 'builtin:SMI-08:27:26', 'OMG-205', '引水梯、舷梯、便梯、PTB使用管理須知', '', 27),
    ('SMI-08', 'builtin:SMI-08:28:27', 'OMG-206', '直升機作業設備', '', 28),
    ('SMI-08', 'builtin:SMI-08:29:28', 'OMG-207', '壓載水處理理系統', '', 29),
    ('SMI-08', 'builtin:SMI-08:30:29', 'OMG-301', '應急發電機和應急蓄電池', '', 30),
    ('SMI-08', 'builtin:SMI-08:31:30', 'OMG-302', '應急空氣壓縮機和應急空氣瓶', '', 31),
    ('SMI-08', 'builtin:SMI-08:32:31', 'OMG-303', '應急照明系統', '', 32),
    ('SMI-08', 'builtin:SMI-08:33:32', 'OMG-304', '應急消防泵', '', 33),
    ('SMI-08', 'builtin:SMI-08:34:33', 'OMG-305', '甲板應急洗眼器、噴淋和便攜洗眼器', '', 34),
    ('SMI-08', 'builtin:SMI-08:35:34', 'OMG-306', '應急拖帶設備', '', 35),
    ('SMI-08', 'builtin:SMI-08:36:35', 'OMG-400', '救生消防設備之總則', '', 36),
    ('SMI-08', 'builtin:SMI-08:37:36', 'OMG-403', '救生艇筏', '', 37),
    ('SMI-08', 'builtin:SMI-08:38:37', 'OMG-404', '火箭降落傘信號、拋繩器、救生艇筏之手持火焰信號及浮煙信號', '', 38),
    ('SMI-08', 'builtin:SMI-08:39:38', 'OMG-405', '救生衣、浸水服和救生圈（含相關的燈、可浮煙霧信號和救生索）', '', 39),
    ('SMI-08', 'builtin:SMI-08:40:39', 'OMG-450', '固定式火警探測和警報系統、防火風閘和通風停止', '', 40),
    ('SMI-08', 'builtin:SMI-08:41:40', 'OMG-451', '防火門和防火分隔', '', 41),
    ('SMI-08', 'builtin:SMI-08:42:41', 'OMG-452', '消防員裝備、消防泵（含應急消防泵）、消防皮龍及水槍和國際通岸接頭', '', 42),
    ('SMI-08', 'builtin:SMI-08:43:42', 'OMG-453', '便攜式滅火器、手提式泡沫槍裝置和輪式（可移動式）滅火器', '', 43),
    ('SMI-08', 'builtin:SMI-08:44:43', 'OMG-454', '固定式滅火系統', '', 44),
    ('SMI-08', 'builtin:SMI-08:45:44', 'OMG-502', '電子海圖顯示與信息系統', '', 45),
    ('SMI-08', 'builtin:SMI-08:46:45', 'OMG-503', '電子海圖更新與維護作業方式', '', 46),
    ('SMI-08', 'builtin:SMI-08:47:46', 'OMG-504', '雷達和自動雷達標繪', '', 47),
    ('SMI-08', 'builtin:SMI-08:48:47', 'OMG-505', '船舶自動識別系統', '', 48),
    ('SMI-08', 'builtin:SMI-08:49:48', 'OMG-506', '磁羅經和陀螺羅經', '', 49),
    ('SMI-08', 'builtin:SMI-08:50:49', 'OMG-507', '航行數據記錄儀（VDR）', '', 50),
    ('SMI-08', 'builtin:SMI-08:51:50', 'OMG-508', '回聲測深儀', '', 51),
    ('SMI-08', 'builtin:SMI-08:52:51', 'OMG-509', '計程儀', '', 52),
    ('SMI-08', 'builtin:SMI-08:53:52', 'OMG-510', '駕駛台值班報警系統', '', 53),
    ('SMI-08', 'builtin:SMI-08:54:53', 'OMG-511', '轉向控制系統（舵機）', '', 54),
    ('SMI-08', 'builtin:SMI-08:55:54', 'OMG-512', '航向記錄儀', '', 55),
    ('SMI-08', 'builtin:SMI-08:56:55', 'OMG-513', '船舶天文鐘', '', 56),
    ('SMI-08', 'builtin:SMI-08:57:56', 'OMG-514', '船舶聲光信號、號型和白晝信號燈管理', '', 57),
    ('SMI-08', 'builtin:SMI-08:58:57', 'OMG-520', '全球海上遇險和安全系統（GMDSS）設備總則', '', 58),
    ('SMI-08', 'builtin:SMI-08:59:58', 'OMG-521', '航行警告電傳系統', '', 59),
    ('SMI-08', 'builtin:SMI-08:60:59', 'OMG-522', '全球衛星導航系統', '', 60),
    ('SMI-08', 'builtin:SMI-08:61:60', 'OMG-523', '船舶甚高頻收發信機', '', 61),
    ('SMI-08', 'builtin:SMI-08:62:61', 'OMG-524', '應急無線電示位標', '', 62),
    ('SMI-08', 'builtin:SMI-08:63:62', 'OMG-525', '搜救雷達應答器', '', 63),
    ('SMI-08', 'builtin:SMI-08:64:63', 'OMG-526', '便攜式雙向甚高頻無線電話裝置', '', 64),
    ('SMI-08', 'builtin:SMI-08:65:64', 'OMG-601', '纜繩和鋼絲', '', 65),
    ('SMI-08', 'builtin:SMI-08:66:65', 'OMG-602', '繫泊、錨泊設備', '', 66),
    ('SMI-08', 'builtin:SMI-08:67:66', 'OMG-603', '起重設備及屬具', '', 67),
    ('SMI-08', 'builtin:SMI-08:68:67', 'OMG-604', '鋼索“牛頭夾”', '', 68),
    ('SMI-08', 'builtin:SMI-08:69:68', 'OMG-702UTI', '和取樣器', '', 69),
    ('SMI-08', 'builtin:SMI-08:70:69', 'OMG-703', '算貨電腦', '', 70),
    ('SMI-08', 'builtin:SMI-08:71:70', 'OMG-704', '貨艙監控系統 貨艙監控系統', '', 71),
    ('SMI-08', 'builtin:SMI-08:72:71', 'OMG-705', '貨艙高位、高高位報警系統', '', 72),
    ('SMI-08', 'builtin:SMI-08:73:72', 'OMG-706', '貨艙透氣系統', '', 73),
    ('SMI-08', 'builtin:SMI-08:74:73', 'OMG-707', '貨氣監控系統和貨艙氣密', '', 74),
    ('SMI-08', 'builtin:SMI-08:75:74', 'OMG-709', '應急停止設備', '', 75),
    ('SMI-08', 'builtin:SMI-08:76:75', 'OMG-711', '深井泵和應急卸貨泵', '', 76),
    ('SMI-08', 'builtin:SMI-08:77:76', 'OMG-712', '氮氣產生器與貨艙惰化操作-NGG', '', 77),
    ('SMI-08', 'builtin:SMI-08:78:77', 'OMG-713', '惰氣系統-IGS', '', 78),
    ('SMI-08', 'builtin:SMI-08:79:78', 'OMG-715', '接地設備', '', 79),
    ('SMI-08', 'builtin:SMI-08:80:79', 'OMG-716', '油類排放監控設備', '', 80),
    ('SMI-08', 'builtin:SMI-08:81:80', 'OMG-717', '貨艙加熱系統', '', 81),
    ('SMI-08', 'builtin:SMI-08:82:81', 'OMG-718', '貨泵溫度監控', '', 82),
    ('SMI-08', 'builtin:SMI-08:83:82', 'OMG-801', '主機動力系統操作', '', 83),
    ('SMI-08', 'builtin:SMI-08:84:83', 'OMG-802', '發電機系統操作', '', 84),
    ('SMI-08', 'builtin:SMI-08:85:84', 'OMG-803', '舵機操作', '', 85),
    ('SMI-08', 'builtin:SMI-08:86:85', 'OMG-804', '鍋爐操作', '', 86),
    ('SMI-08', 'builtin:SMI-08:87:86', 'OMG-805', '焚燒爐操作', '', 87),
    ('SMI-08', 'builtin:SMI-08:88:87', 'OMG-806', '生活汙水處理裝置', '', 88),
    ('SMI-08', 'builtin:SMI-08:89:88', 'OMG-807', '機艙主海水管路海底門和海水泵', '', 89),
    ('SMI-08', 'builtin:SMI-08:90:89', 'OMG-808', '艙底水監控', '', 90),
    ('SMI-08', 'builtin:SMI-08:91:90', 'OMG-809', '油水分離器', '', 91),
    ('SMI-08', 'builtin:SMI-08:92:91', 'OMG-810', '造水機', '', 92),
    ('SMI-08', 'builtin:SMI-08:93:92', 'OMG-811', '機艙燃油滑油分離淨化設備', '', 93),
    ('SMI-08', 'builtin:SMI-08:94:93', 'OMG-812', '廢氣清潔系統', '', 94),
    ('SMI-08', 'builtin:SMI-08:95:94', 'OMG-813', '廢氣除氮氧化物裝置', '', 95),
    ('SMI-08', 'builtin:SMI-08:96:95', 'OMG-814', '電氣分配電板的絕緣接地監測系統', '', 96),
    ('SMI-08', 'builtin:SMI-08:97:96', 'OMG-815', '絕緣墊', '', 97),
    ('SMI-08', 'builtin:SMI-08:98:97', 'OMG-816', '熱作設備操作(電焊+氣焊)', '', 98),
    ('SMI-08', 'builtin:SMI-08:99:98', 'OMG-817', '機艙防火-熱表面防護與防止油類噴濺', '', 99),
    ('SMI-08', 'builtin:SMI-08:100:99', 'OMG-818', '液壓單元間油霧濃度探測器', '', 100),
    ('SMI-08', 'builtin:SMI-08:101:100', 'OMG-819', '機艙火災控制-速閉閥、風機、風閥、油泵緊急停止', '', 101),
    ('SMI-08', 'builtin:SMI-08:102:101', 'OMG-820', '水密門操作及維護管理', '', 102),
    ('SMI-08', 'builtin:SMI-08:103:102', 'OMG-821', '船用電梯', '', 103),
    ('SMI-08', 'builtin:SMI-08:104:103', 'OMG-822', '海生物附著防治與靜電防護系統管理', '', 104),
    ('SMI-10', 'builtin:SMI-10:1:0', 'SCP-001', '船舶保安總則', '', 1),
    ('SMI-10', 'builtin:SMI-10:2:1', 'SCP-002', '船舶網絡安防', '', 2),
    ('SMI-10', 'builtin:SMI-10:3:2', 'SCP-003', '船舶安保報警系統須知', '', 3),
    ('SMI-10', 'builtin:SMI-10:4:3', 'SCP-004', '高風險和戰區航行安全須知', '', 4),
    ('SMI-10', 'builtin:SMI-10:5:4', 'SCP-005', '高風險和戰區的具體指導', '', 5),
    ('SMI-10', 'builtin:SMI-10:6:5', 'SCP-006', '保安人員管控', '', 6),
    ('SMI-10', 'builtin:SMI-10:7:6', 'SCP-007', '通過風險區域的基本準備', '', 7),
    ('SMI-10', 'builtin:SMI-10:8:7', 'SCP-008', '海上難民', '', 8),
    ('SMI-10', 'builtin:SMI-10:9:8', 'SCP-009', '國際走廊和編隊通過', '', 9),
    ('SMI-10', 'builtin:SMI-10:10:9', 'SCP', '附件-01賴籍船舶武裝護衛申請作業須知', '', 10),
    ('SMI-10', 'builtin:SMI-10:11:10', 'SCP-', '附件-02 賴籍船舶防海盜檢查表', '', 11),
    ('SMI-10', 'builtin:SMI-10:12:11', 'SCP-', '附件-03 航行限制政策一覽表', '', 12),
    ('SMI-11', 'builtin:SMI-11:1:0', 'SHE-210', '壓載泵艙、貨泵艙積水或漏貨處理', '', 1),
    ('SMI-11', 'builtin:SMI-11:2:1', 'SHE-211', '裝卸貨期間全船失電、貨物系統失去動力', '', 2),
    ('SMI-11', 'builtin:SMI-11:3:2', 'SHE-001', '船舶應急總則', '', 3),
    ('SMI-11', 'builtin:SMI-11:4:3', 'SHE-002', '船舶應急小組', '', 4),
    ('SMI-11', 'builtin:SMI-11:5:4', 'SHE-003', '應急情況的標識及演習培訓要求', '', 5),
    ('SMI-11', 'builtin:SMI-11:6:5', 'SHE-004', '應急計劃的準備和檢討', '', 6),
    ('SMI-11', 'builtin:SMI-11:7:6', 'SHE-005', '應急處理常規流程', '', 7),
    ('SMI-11', 'builtin:SMI-11:8:7', 'SHE-006', '應急的善後、報告和調查', '', 8),
    ('SMI-11', 'builtin:SMI-11:9:8', 'SHE-007', '請求第三方救助須知', '', 9),
    ('SMI-11', 'builtin:SMI-11:10:9', 'SHE-008', '公共關系與政府關系', '', 10),
    ('SMI-11', 'builtin:SMI-11:11:10', 'SHE-009', '船舶對外應對須知', '', 11),
    ('SMI-11', 'builtin:SMI-11:12:11', 'SHE-010', '應急拖帶須知', '', 12),
    ('SMI-11', 'builtin:SMI-11:13:12', 'SHE-011', '遇險船舶船長操作GMDSS設備指南', '', 13),
    ('SMI-11', 'builtin:SMI-11:14:13', 'SHE-100', '火災 & 爆炸', '', 14),
    ('SMI-11', 'builtin:SMI-11:15:14', 'SHE-101', '船舶碰撞', '', 15),
    ('SMI-11', 'builtin:SMI-11:16:15', 'SHE-102', '擱淺/觸礁', '', 16),
    ('SMI-11', 'builtin:SMI-11:17:16', 'SHE-103', '船體進水', '', 17),
    ('SMI-11', 'builtin:SMI-11:18:17', 'SHE-104', '船舶傾覆危險', '', 18),
    ('SMI-11', 'builtin:SMI-11:19:18', 'SHE-105', '主機故障', '', 19),
    ('SMI-11', 'builtin:SMI-11:20:19', 'SHE-106', '舵機故障', '', 20),
    ('SMI-11', 'builtin:SMI-11:21:20', 'SHE-107', '船舶失電', '', 21),
    ('SMI-11', 'builtin:SMI-11:22:21', 'SHE-108', '結構損害', '', 22),
    ('SMI-11', 'builtin:SMI-11:23:22', 'SHE-109', '惡劣天氣損害', '', 23),
    ('SMI-11', 'builtin:SMI-11:24:23', 'SHE-110', '海難救助', '', 24),
    ('SMI-11', 'builtin:SMI-11:25:24', 'SHE-111', '應急拖帶', '', 25),
    ('SMI-11', 'builtin:SMI-11:26:25', 'SHE-112', '船舶脫離碼頭', '', 26),
    ('SMI-11', 'builtin:SMI-11:27:26', 'SHE-113', '燃料油溢漏', '', 27),
    ('SMI-11', 'builtin:SMI-11:28:27', 'SHE-114', '可燃、有毒/氮氣氣體洩漏', '', 28),
    ('SMI-11', 'builtin:SMI-11:29:28', 'SHE-115', '船舶失去聯繫', '', 29),
    ('SMI-11', 'builtin:SMI-11:30:29', 'SHE-116', '海盜、武裝搶劫', '', 30),
    ('SMI-11', 'builtin:SMI-11:31:30', 'SHE-117', '偷渡、毒品、走私', '', 31),
    ('SMI-11', 'builtin:SMI-11:32:31', 'SHE-118', '船舶治安、刑事案件', '', 32),
    ('SMI-11', 'builtin:SMI-11:33:32', 'SHE-119', '棄船', '', 33),
    ('SMI-11', 'builtin:SMI-11:34:33', 'SHE-120', '人員傷亡', '', 34),
    ('SMI-11', 'builtin:SMI-11:35:34', 'SHE-121', '人員落水', '', 35),
    ('SMI-11', 'builtin:SMI-11:36:35', 'SHE-122', '搜救', '', 36),
    ('SMI-11', 'builtin:SMI-11:37:36', 'SHE-123', '封閉場所救援', '', 37),
    ('SMI-11', 'builtin:SMI-11:38:37', 'SHE-124', '醫療急救', '', 38),
    ('SMI-11', 'builtin:SMI-11:39:38', 'SHE-125', '直升機救助', '', 39),
    ('SMI-11', 'builtin:SMI-11:40:39', 'SHE-126', '疫情事件', '', 40),
    ('SMI-11', 'builtin:SMI-11:41:40', 'SHE-127', '網絡安全響應和恢復須知', '', 41),
    ('SMI-11', 'builtin:SMI-11:42:41', 'SHE-128', '加油、駁油洩漏應急', '', 42),
    ('SMI-11', 'builtin:SMI-11:43:42', 'SHE-129', '機控室操車和應急操車', '', 43),
    ('SMI-11', 'builtin:SMI-11:44:43', 'SHE-130', '人員觸電應急預案', '', 44),
    ('SMI-11', 'builtin:SMI-11:45:44', 'SHE-131', '船舶緊急從碼頭脫離應急預案', '', 45),
    ('SMI-11', 'builtin:SMI-11:46:45', 'SHE-132', '吊機人員轉移中吊車故障應急', '', 46),
    ('SMI-11', 'builtin:SMI-11:47:46', 'SHE-133', '室內空間淹水應急處理', '', 47),
    ('SMI-11', 'builtin:SMI-11:48:47', 'SHE-200', '貨管爆裂溢漏', '', 48),
    ('SMI-11', 'builtin:SMI-11:49:48', 'SHE-201', '生活區、機艙可燃氣體探測系統報警', '', 49),
    ('SMI-11', 'builtin:SMI-11:50:49', 'SHE-202', '有毒液體溢漏', '', 50),
    ('SMI-11', 'builtin:SMI-11:51:50', 'SHE-203', '艙室洩漏應急處理程序', '', 51),
    ('SMI-11', 'builtin:SMI-11:52:51', 'SHE-204', '承載艙系統故障與液貨承載艙導致之危險情況', '', 52),
    ('SMI-11', 'builtin:SMI-11:53:52', 'SHE-205', '化學品液貨之危險反應和自反應', '', 53),
    ('SMI-11', 'builtin:SMI-11:54:53', 'SHE-206', '液貨艙環境控制失效', '', 54),
    ('SMI-11', 'builtin:SMI-11:55:54', 'SHE-207', '液貨洩漏和投棄', '', 55),
    ('SMI-11', 'builtin:SMI-11:56:55', 'SHE-208', '液貨船裝卸貨時少量洩漏處理程序', '', 56),
    ('SMI-11', 'builtin:SMI-11:57:56', 'SHE-209', '液貨船裝卸貨時嚴重俯仰或傾斜', '', 57),
    ('SMI-11', 'builtin:SMI-11:58:57', 'SHE-251', '貨物移位（散雜集）', '', 58),
    ('SMI-11', 'builtin:SMI-11:59:58', 'SHE-252', '貨物拋棄（散雜集）', '', 59),
    ('SMI-11', 'builtin:SMI-11:60:59', 'SHE-253', '散貨船喪失穩性', '', 60),
    ('SMI-11', 'builtin:SMI-11:61:60', 'SHE-301', '電羅經、磁羅經故障', '', 61),
    ('SMI-11', 'builtin:SMI-11:62:61', 'SHE-302ECDIS', '故障', '', 62),
    ('SMI-11', 'builtin:SMI-11:63:62', 'SHE-303', '雷達故障', '', 63),
    ('SMI-11', 'builtin:SMI-11:64:63', 'SHE-304', '全球定位系統受干擾/欺騙/故障', '', 64),
    ('SMI-11', 'builtin:SMI-11:65:64', 'SHE-305', '測深儀、計程儀故障', '', 65),
    ('SMI-11', 'builtin:SMI-11:66:65', 'SHE-306', '航行信號燈故障', '', 66),
    ('SMI-11', 'builtin:SMI-11:67:66', 'SHE-307', '駕駛台操舵系統故障', '', 67),
    ('SMI-11', 'builtin:SMI-11:68:67', 'SHE-308', '其他設備故障應急預案(AIS/NAVTEX/VHF/VDR/BNWAS)', '', 68),
    ('SMI-11', 'builtin:SMI-11:69:68', 'SHE-310', '周圍船舶發生緊急情況的應急須知', '', 69),
    ('SMI-11', 'builtin:SMI-11:70:69', 'SHE-311', '船頭、泵艙或其他甲板空間積液', '', 70),
    ('SMI-11', 'builtin:SMI-11:71:70', 'SHE-312', '機艙或其他機艙甲板空間積液', '', 71),
    ('SMI-12', 'builtin:SMI-12:1:0', 'OOI-001', '接船須知', '', 1)
)
insert into sqms_catalog_items (topic_id, seed_key, code, title_zh, title_en, sort_order)
select topic.id, seed.seed_key, seed.code, seed.title_zh, seed.title_en, seed.sort_order
from seed join sqms_catalog_topics topic on topic.code = seed.topic_code
on conflict (seed_key) do nothing;

create or replace function can_manage_sqms_catalog()
returns boolean language sql stable security definer set search_path = public as $$
  select is_sqms_admin();
$$;

create or replace function save_sqms_catalog_entry(
  p_entity_type text,
  p_id uuid,
  p_parent_id uuid,
  p_code text,
  p_name_zh text,
  p_name_en text,
  p_sort_order integer,
  p_active boolean
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  clean_code text := trim(coalesce(p_code, ''));
  clean_name_zh text := trim(coalesce(p_name_zh, ''));
  clean_name_en text := trim(coalesce(p_name_en, ''));
  saved_category sqms_catalog_categories%rowtype;
  saved_topic sqms_catalog_topics%rowtype;
  saved_item sqms_catalog_items%rowtype;
begin
  if not can_manage_sqms_catalog() then raise exception '只有 Owner 或雲端管理員可以修改三層目錄'; end if;
  if p_entity_type not in ('category', 'topic', 'item') then raise exception '目錄層級不正確'; end if;
  if clean_code = '' then raise exception '代碼不可為空'; end if;
  if clean_name_zh = '' then raise exception '中文名稱不可為空'; end if;
  if p_sort_order is null or p_sort_order < 0 then raise exception '排序必須是 0 或更大的整數'; end if;
  if p_active is null then raise exception '啟用狀態不可為空'; end if;

  if p_entity_type = 'category' then
    if p_id is null then
      if exists (select 1 from sqms_catalog_categories where code = clean_code) then raise exception '大類代碼已存在'; end if;
      insert into sqms_catalog_categories (code, name_zh, name_en, sort_order, active)
      values (clean_code, clean_name_zh, clean_name_en, p_sort_order, p_active) returning * into saved_category;
    else
      select * into saved_category from sqms_catalog_categories where id = p_id for update;
      if not found then raise exception '找不到要修改的大類'; end if;
      if saved_category.code <> clean_code then raise exception '已建立的大類代碼不可修改'; end if;
      update sqms_catalog_categories set name_zh = clean_name_zh, name_en = clean_name_en,
        sort_order = p_sort_order, active = p_active where id = p_id returning * into saved_category;
    end if;
    return jsonb_build_object('entityType', 'category', 'row', to_jsonb(saved_category));
  end if;

  if p_entity_type = 'topic' then
    if p_parent_id is null or not exists (select 1 from sqms_catalog_categories where id = p_parent_id) then raise exception '找不到指定的大類'; end if;
    if p_id is null then
      if exists (select 1 from sqms_catalog_topics where code = clean_code) then raise exception '第一層主題代碼已存在'; end if;
      insert into sqms_catalog_topics (category_id, code, title_zh, title_en, sort_order, active)
      values (p_parent_id, clean_code, clean_name_zh, clean_name_en, p_sort_order, p_active) returning * into saved_topic;
    else
      select * into saved_topic from sqms_catalog_topics where id = p_id for update;
      if not found then raise exception '找不到要修改的第一層主題'; end if;
      if saved_topic.code <> clean_code then raise exception '已建立的第一層主題代碼不可修改'; end if;
      update sqms_catalog_topics set category_id = p_parent_id, title_zh = clean_name_zh,
        title_en = clean_name_en, sort_order = p_sort_order, active = p_active
      where id = p_id returning * into saved_topic;
    end if;
    return jsonb_build_object('entityType', 'topic', 'row', to_jsonb(saved_topic));
  end if;

  if p_parent_id is null or not exists (select 1 from sqms_catalog_topics where id = p_parent_id) then raise exception '找不到指定的第一層主題'; end if;
  lock table sqms_catalog_items in share row exclusive mode;
  if p_id is null then
    if exists (select 1 from sqms_catalog_items where code = clean_code) then raise exception '第二層項目代碼已存在；新建代碼必須在全目錄唯一'; end if;
    insert into sqms_catalog_items (topic_id, code, title_zh, title_en, sort_order, active)
    values (p_parent_id, clean_code, clean_name_zh, clean_name_en, p_sort_order, p_active) returning * into saved_item;
  else
    select * into saved_item from sqms_catalog_items where id = p_id for update;
    if not found then raise exception '找不到要修改的第二層項目'; end if;
    if saved_item.code <> clean_code then raise exception '已建立的第二層項目代碼不可修改'; end if;
    if saved_item.topic_id <> p_parent_id and exists (
      select 1 from sqms_catalog_items where topic_id = p_parent_id and code = clean_code and id <> p_id
    ) then raise exception '目標第一層主題已有相同的第二層代碼'; end if;
    update sqms_catalog_items set topic_id = p_parent_id, title_zh = clean_name_zh,
      title_en = clean_name_en, sort_order = p_sort_order, active = p_active
    where id = p_id returning * into saved_item;
  end if;
  return jsonb_build_object('entityType', 'item', 'row', to_jsonb(saved_item));
end;
$$;

alter table sqms_catalog_categories enable row level security;
alter table sqms_catalog_topics enable row level security;
alter table sqms_catalog_items enable row level security;

drop policy if exists sqms_catalog_categories_public_read on sqms_catalog_categories;
create policy sqms_catalog_categories_public_read on sqms_catalog_categories for select to anon, authenticated using (true);
drop policy if exists sqms_catalog_topics_public_read on sqms_catalog_topics;
create policy sqms_catalog_topics_public_read on sqms_catalog_topics for select to anon, authenticated using (true);
drop policy if exists sqms_catalog_items_public_read on sqms_catalog_items;
create policy sqms_catalog_items_public_read on sqms_catalog_items for select to anon, authenticated using (true);

revoke all on sqms_catalog_categories, sqms_catalog_topics, sqms_catalog_items from public, anon, authenticated;
grant select on sqms_catalog_categories, sqms_catalog_topics, sqms_catalog_items to anon, authenticated;
revoke all on function can_manage_sqms_catalog() from public;
revoke all on function save_sqms_catalog_entry(text, uuid, uuid, text, text, text, integer, boolean) from public;
grant execute on function can_manage_sqms_catalog() to authenticated;
grant execute on function save_sqms_catalog_entry(text, uuid, uuid, text, text, text, integer, boolean) to authenticated;

do $$
begin
  if (select count(*) from sqms_catalog_categories where code in ('SMM','SMP','SMI','SQMS','ISO')) <> 5 then raise exception 'CATALOG_SEED_CATEGORY_MISMATCH'; end if;
  if (select count(*) from sqms_catalog_topics where code in ('SMM-01','SMM-02','SMM-03','SMM-04','SMM-05','SMM-06','SMM-07','SMM-08','SMM-09','SMM-10','SMM-11','SMM-12','SMM-13','SMM-14','SMM-15','SMP-01','SMP-02','SMP-03','SMP-04','SMP-05','SMP-06','SMP-07','SMP-08','SMP-09','SMP-10','SMP-11','SMP-12','SMP-13','SMI-01','SMI-02','SMI-03','SMI-04','SMI-05','SMI-06','SMI-07','SMI-08','SMI-09','SMI-10','SMI-11','SMI-12','SQMS-00a','SQMS-00b','SQMS-00c','ISO-01','ISO-02','ISO-03')) <> 46 then raise exception 'CATALOG_SEED_TOPIC_MISMATCH'; end if;
  if (select count(*) from sqms_catalog_items where seed_key like 'builtin:%') < 559 then raise exception 'CATALOG_SEED_ITEM_MISMATCH'; end if;
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'sqms_catalog_categories') then alter publication supabase_realtime add table sqms_catalog_categories; end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'sqms_catalog_topics') then alter publication supabase_realtime add table sqms_catalog_topics; end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'sqms_catalog_items') then alter publication supabase_realtime add table sqms_catalog_items; end if;
  end if;
end;
$$;

commit;
