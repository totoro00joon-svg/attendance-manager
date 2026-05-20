const STORAGE_KEY = "attendance-records-v2";

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
const memo = document.querySelector("#memo");
const saveButton = document.querySelector("#saveButton");
const cancelEditButton = document.querySelector("#cancelEditButton");
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

function makeTime(hour, minute) {
  return `${hour}:${minute}`;
}

function fillTimeSelects() {
  for (let hour = 0; hour < 24; hour += 1) {
    const option = new Option(pad(hour), pad(hour));
    startHour.add(option.cloneNode(true));
    endHour.add(option);
  }

  for (let minute = 0; minute < 60; minute += 5) {
    const option = new Option(pad(minute), pad(minute));
    startMinute.add(option.cloneNode(true));
    endMinute.add(option);
  }
}

function loadRecords() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

function saveRecords() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
}

function minutesFromTime(time) {
  const [hour, minute] = time.split(":").map(Number);
  return hour * 60 + minute;
}

function workMinutes(record) {
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

function setDefaultForm() {
  workDate.value = todayString();
  startHour.value = "09";
  startMinute.value = "00";
  endHour.value = "18";
  endMinute.value = "00";
  memo.value = "";
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
    memo: memo.value.trim(),
  };
}

function sortRecords(list) {
  return [...list].sort((a, b) => b.date.localeCompare(a.date) || b.start.localeCompare(a.start));
}

function filteredRecords() {
  const keyword = searchInput.value.trim().toLowerCase();
  if (!keyword) return sortRecords(records);
  return sortRecords(
    records.filter((record) => {
      return record.date.includes(keyword) || record.memo.toLowerCase().includes(keyword);
    }),
  );
}

function renderRecords() {
  const list = filteredRecords();
  recordTable.innerHTML = "";

  list.forEach((record) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${record.date}</td>
      <td>${record.start}</td>
      <td>${record.end}</td>
      <td>${formatDuration(workMinutes(record))}</td>
      <td>${record.memo || "-"}</td>
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
}

function renderSummary() {
  const currentMonth = todayString().slice(0, 7);
  const monthRecords = records.filter((record) => record.date.startsWith(currentMonth));
  const total = monthRecords.reduce((sum, record) => sum + workMinutes(record), 0);
  const average = monthRecords.length ? Math.round(total / monthRecords.length) : 0;

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

function editRecord(id) {
  const record = records.find((item) => item.id === id);
  if (!record) return;
  editingId = id;
  workDate.value = record.date;
  [startHour.value, startMinute.value] = record.start.split(":");
  [endHour.value, endMinute.value] = record.end.split(":");
  memo.value = record.memo;
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

  const headers = ["날짜", "출근시간", "퇴근시간", "근무시간", "메모"];
  const rows = sortRecords(records).map((record) => [
    record.date,
    record.start,
    record.end,
    formatDuration(workMinutes(record)),
    record.memo,
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
