const STORAGE_KEY = "attendance-records-v4";
const DEFAULT_ATTENDANCE_TYPE = "정상출근";

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js");
  });
}

const form = document.querySelector("#attendanceForm");
const workDate = document.querySelector("#workDate");
const startHour = document.querySelector("#startHour");
const startMinute = document.querySelector("#startMinute");
const endHour = document.querySelector("#endHour");
const endMinute = document.querySelector("#endMinute");
const attendanceType = document.querySelector("#attendanceType");
const saveButton = document.querySelector("#saveButton");
const cancelEditButton = document.querySelector("#cancelEditButton");
const clockInButton = document.querySelector("#clockInButton");
const clockOutButton = document.querySelector("#clockOutButton");
const todayStatus = document.querySelector("#todayStatus");
const recordTable = document.querySelector("#recordTable");
const emptyState = document.querySelector("#emptyState");
const recordCount = document.querySelector("#recordCount");
const searchInput = document.querySelector("#searchInput");
const exportButton = document.querySelector("#exportButton");
const clearButton = document.querySelector("#clearButton");
const monthDays = document.querySelector("#monthDays");
const monthHours = document.querySelector("#monthHours");
const avgHours = document.querySelector("#avgHours");
const todayLabel = document.querySelector("#todayLabel");

let records = loadRecords();
let editingId = null;

function pad(value) {
  return String(value).padStart(2, "0");
}

function todayString() {
  const date = new Date();
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function nowTime() {
  const date = new Date();
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function makeTime(hour, minute) {
  return `${hour}:${minute}`;
}

function fillTimeSelects() {
  for (let hour = 0; hour < 24; hour += 1) {
    const option = new Option(pad(hour), pad(hour));
    startHour.add(option.cloneNode(true));
    endHour.add(option);
  }

  for (let minute = 0; minute < 60; minute += 1) {
    const option = new Option(pad(minute), pad(minute));
    startMinute.add(option.cloneNode(true));
    endMinute.add(option);
  }
}

function loadRecords() {
  try {
    const current = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (Array.isArray(current)) return normalizeRecords(current);

    const oldKeys = ["attendance-records-v3", "attendance-records-v2", "attendance-records-v1"];
    for (const key of oldKeys) {
      const oldRecords = JSON.parse(localStorage.getItem(key));
      if (Array.isArray(oldRecords)) return normalizeRecords(oldRecords);
    }
  } catch {
    return [];
  }
  return [];
}

function normalizeRecords(list) {
  return list.map((record) => ({
    ...record,
    type: record.type || record.memo || DEFAULT_ATTENDANCE_TYPE,
  }));
}

function saveRecords() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
}

function minutesFromTime(time) {
  if (!time) return null;
  const [hour, minute] = time.split(":").map(Number);
  return hour * 60 + minute;
}

function workMinutes(record) {
  if (!record.start || !record.end) return 0;
  let minutes = minutesFromTime(record.end) - minutesFromTime(record.start);
  if (minutes < 0) minutes += 24 * 60;
  return minutes;
}

function formatDuration(minutes) {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) return `${mins}분`;
  if (mins === 0) return `${hours}시간`;
  return `${hours}시간 ${mins}분`;
}

function setTimeControls(start, end) {
  const [sHour, sMinute] = start.split(":");
  const [eHour, eMinute] = end.split(":");
  startHour.value = sHour;
  startMinute.value = sMinute;
  endHour.value = eHour;
  endMinute.value = eMinute;
}

function setDefaultForm() {
  workDate.value = todayString();
  setTimeControls("09:00", "18:00");
  attendanceType.value = DEFAULT_ATTENDANCE_TYPE;
  editingId = null;
  saveButton.textContent = "기록 저장";
  cancelEditButton.hidden = true;
}

function currentFormRecord() {
  return {
    id: editingId || crypto.randomUUID(),
    date: workDate.value,
    start: makeTime(startHour.value, startMinute.value),
    end: makeTime(endHour.value, endMinute.value),
    type: attendanceType.value,
  };
}

function getTodayRecord() {
  return records.find((record) => record.date === todayString());
}

function sortRecords(list) {
  return [...list].sort((a, b) => b.date.localeCompare(a.date) || (b.start || "").localeCompare(a.start || ""));
}

function filteredRecords() {
  const keyword = searchInput.value.trim().toLowerCase();
  if (!keyword) return sortRecords(records);
  return sortRecords(
    records.filter((record) => {
      return record.date.includes(keyword) || (record.type || "").toLowerCase().includes(keyword);
    }),
  );
}

function renderTodayStatus() {
  const record = getTodayRecord();
  if (!record) {
    todayStatus.textContent = "출근 전";
    clockInButton.disabled = false;
    clockOutButton.disabled = false;
    return;
  }

  if (record.start && record.end) {
    todayStatus.textContent = `출근 ${record.start} · 퇴근 ${record.end}`;
    clockInButton.disabled = false;
    clockOutButton.disabled = false;
    return;
  }

  todayStatus.textContent = `출근 ${record.start} · 퇴근 전`;
  clockInButton.disabled = false;
  clockOutButton.disabled = false;
}

function renderRecords() {
  const list = filteredRecords();
  recordTable.innerHTML = "";

  list.forEach((record) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${record.date}</td>
      <td>${record.start || "-"}</td>
      <td>${record.end || "-"}</td>
      <td>${record.start && record.end ? formatDuration(workMinutes(record)) : "-"}</td>
      <td>${record.type || DEFAULT_ATTENDANCE_TYPE}</td>
      <td>
        <div class="row-actions">
          <button class="ghost" type="button" data-action="edit" data-id="${record.id}">수정</button>
          <button class="danger" type="button" data-action="delete" data-id="${record.id}">삭제</button>
        </div>
      </td>
    `;
    recordTable.appendChild(row);
  });

  emptyState.classList.toggle("hidden", list.length > 0);
  recordCount.textContent = `저장된 기록 ${records.length}개`;
  renderSummary();
  renderTodayStatus();
}

function renderSummary() {
  const currentMonth = todayString().slice(0, 7);
  const monthRecords = records.filter((record) => record.date.startsWith(currentMonth));
  const completedRecords = monthRecords.filter((record) => record.start && record.end);
  const total = completedRecords.reduce((sum, record) => sum + workMinutes(record), 0);
  const average = completedRecords.length ? Math.round(total / completedRecords.length) : 0;

  monthDays.textContent = `${monthRecords.length}일`;
  monthHours.textContent = formatDuration(total);
  avgHours.textContent = formatDuration(average);
}

function upsertRecord(record) {
  const sameDateIndex = records.findIndex((item) => item.date === record.date);
  const editIndex = records.findIndex((item) => item.id === record.id);

  if (editIndex >= 0) {
    records[editIndex] = record;
    return true;
  }

  if (sameDateIndex >= 0) {
    const shouldReplace = confirm("같은 날짜의 기록이 있습니다. 새 내용으로 바꿀까요?");
    if (!shouldReplace) return false;
    records[sameDateIndex] = { ...record, id: records[sameDateIndex].id };
    return true;
  }

  records.push(record);
  return true;
}

function quickRecord(type) {
  const date = todayString();
  const time = nowTime();
  const record = getTodayRecord();

  if (type === "in") {
    if (record?.start) {
      const replace = confirm(`오늘 출근시간이 이미 ${record.start}로 기록되어 있습니다. ${time}로 바꿀까요?`);
      if (!replace) return;
      record.start = time;
    } else if (record) {
      record.start = time;
    } else {
      records.push({ id: crypto.randomUUID(), date, start: time, end: "", type: DEFAULT_ATTENDANCE_TYPE });
    }
  }

  if (type === "out") {
    if (!record) {
      const create = confirm("오늘 출근 기록이 없습니다. 퇴근시간만 먼저 기록할까요?");
      if (!create) return;
      records.push({ id: crypto.randomUUID(), date, start: "", end: time, type: DEFAULT_ATTENDANCE_TYPE });
    } else if (record.end) {
      const replace = confirm(`오늘 퇴근시간이 이미 ${record.end}로 기록되어 있습니다. ${time}로 바꿀까요?`);
      if (!replace) return;
      record.end = time;
    } else {
      record.end = time;
    }
  }

  saveRecords();
  setDefaultForm();
  renderRecords();
}

function editRecord(id) {
  const record = records.find((item) => item.id === id);
  if (!record) return;
  editingId = id;
  workDate.value = record.date;
  setTimeControls(record.start || "09:00", record.end || "18:00");
  attendanceType.value = record.type || record.memo || DEFAULT_ATTENDANCE_TYPE;
  saveButton.textContent = "수정 저장";
  cancelEditButton.hidden = false;
  workDate.focus();
}

function deleteRecord(id) {
  const record = records.find((item) => item.id === id);
  if (!record) return;
  const confirmed = confirm(`${record.date} 기록을 삭제할까요?`);
  if (!confirmed) return;
  records = records.filter((item) => item.id !== id);
  saveRecords();
  renderRecords();
}

function exportCsv() {
  if (records.length === 0) {
    alert("내보낼 기록이 없습니다.");
    return;
  }

  const headers = ["날짜", "출근시간", "퇴근시간", "근무시간", "근태종류"];
  const rows = sortRecords(records).map((record) => [
    record.date,
    record.start || "",
    record.end || "",
    record.start && record.end ? formatDuration(workMinutes(record)) : "",
    record.type || DEFAULT_ATTENDANCE_TYPE,
  ]);
  const csv = [headers, ...rows]
    .map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `attendance-${todayString()}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const saved = upsertRecord(currentFormRecord());
  if (!saved) return;
  saveRecords();
  setDefaultForm();
  renderRecords();
});

recordTable.addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (!button) return;
  const { action, id } = button.dataset;
  if (action === "edit") editRecord(id);
  if (action === "delete") deleteRecord(id);
});

clockInButton.addEventListener("click", () => quickRecord("in"));
clockOutButton.addEventListener("click", () => quickRecord("out"));
cancelEditButton.addEventListener("click", setDefaultForm);
searchInput.addEventListener("input", renderRecords);
exportButton.addEventListener("click", exportCsv);
clearButton.addEventListener("click", () => {
  if (records.length === 0) return;
  const confirmed = confirm("모든 근태 기록을 삭제할까요?");
  if (!confirmed) return;
  records = [];
  saveRecords();
  setDefaultForm();
  renderRecords();
});

fillTimeSelects();
todayLabel.textContent = new Date().toLocaleDateString("ko-KR", {
  month: "long",
  day: "numeric",
  weekday: "short",
});
setDefaultForm();
renderRecords();
