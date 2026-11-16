import React, { useState, useEffect, useMemo } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Switch,
  Modal,
  Alert,
  SafeAreaView,
  Platform,
} from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import * as Notifications from 'expo-notifications';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import AsyncStorage from '@react-native-async-storage/async-storage';

// --- THEME PALETTE (#23324A & #C7C9C2) ---
const THEME = {
  primary: '#23324A',     // Deep Navy
  secondary: '#C7C9C2',   // Warm Sage-Grey
  background: '#F4F5F3',  // Light off-white derived from #C7C9C2
  surface: '#FFFFFF',     // Crisp card background
  textDark: '#23324A',    // High-contrast navy text
  textMuted: '#5A6577',   // Muted slate-navy
  accentAlert: '#B91C1C', // Crimson for baited deadlines
};

// --- NOTIFICATION CONFIGURATION ---
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

// --- TYPES ---
type TaskStatus = 'Todo' | 'In Progress' | 'Done';

interface Task {
  id: string;
  moduleId: string;
  title: string;
  status: TaskStatus;
  actualDueDate: string; // YYYY-MM-DD
  baitEnabled: boolean;
}

interface GradedItem {
  id: string;
  name: string;
  weight: number;
  score: number;
  maxScore: number;
}

interface ResourceItem {
  id: string;
  type: 'Note' | 'Tutorial' | 'PYP';
  title: string;
  contentOrStatus: string;
}

interface Module {
  id: string;
  code: string;
  name: string;
  credits: number;
  gradedItems: GradedItem[];
  resources: ResourceItem[];
}

interface CalendarBlock {
  id: string;
  title: string;
  day: string;
  startTime: string;
  endTime: string;
  type: 'Class' | 'Study' | 'Personal';
}

// --- INITIAL SAMPLE DATA ---
const INITIAL_MODULES: Module[] = [
  {
    id: 'm1',
    code: 'CS2040S',
    name: 'Data Structures & Algorithms',
    credits: 4,
    gradedItems: [
      { id: 'g1', name: 'Problem Set 1', weight: 15, score: 14, maxScore: 15 },
      { id: 'g2', name: 'Midterm Exam', weight: 35, score: 78, maxScore: 100 },
    ],
    resources: [
      { id: 'r1', type: 'Note', title: 'Week 3: AVL Trees', contentOrStatus: 'Balance factor must stay between -1 and 1. Rotations take O(1).' },
      { id: 'r2', type: 'Tutorial', title: 'Tutorial 4: Hashing', contentOrStatus: 'Mastered' },
      { id: 'r3', type: 'PYP', title: 'AY24/25 Sem 1 Finals', contentOrStatus: 'Needs Review' },
    ],
  },
  {
    id: 'm2',
    code: 'MA1521',
    name: 'Calculus for Computing',
    credits: 4,
    gradedItems: [
      { id: 'g3', name: 'Quiz 1', weight: 20, score: 18, maxScore: 20 },
    ],
    resources: [
      { id: 'r4', type: 'Note', title: 'Taylor Series', contentOrStatus: 'Remember remainder term estimation for error bounds.' },
      { id: 'r5', type: 'PYP', title: 'AY23/24 Sem 2 Finals', contentOrStatus: 'Unattempted' },
    ],
  },
];

const INITIAL_TASKS: Task[] = [
  {
    id: 't1',
    moduleId: 'm1',
    title: 'Submit Problem Set 4 (Graphs)',
    status: 'In Progress',
    actualDueDate: new Date(Date.now() + 9 * 86400000).toISOString().split('T')[0],
    baitEnabled: true,
  },
  {
    id: 't2',
    moduleId: 'm2',
    title: 'Complete Integration Worksheet',
    status: 'Todo',
    actualDueDate: new Date(Date.now() + 12 * 86400000).toISOString().split('T')[0],
    baitEnabled: true,
  },
];

const INITIAL_BLOCKS: CalendarBlock[] = [
  { id: 'b1', title: 'CS2040S Lecture', day: 'Mon', startTime: '10:00', endTime: '12:00', type: 'Class' },
  { id: 'b2', title: 'Deep Work: Graph Algo', day: 'Mon', startTime: '14:00', endTime: '16:00', type: 'Study' },
  { id: 'b3', title: 'MA1521 Tutorial', day: 'Wed', startTime: '13:00', endTime: '14:00', type: 'Class' },
];

const Tab = createBottomTabNavigator();

export default function App() {
  const [modules, setModules] = useState<Module[]>(INITIAL_MODULES);
  const [tasks, setTasks] = useState<Task[]>(INITIAL_TASKS);
  const [calendarBlocks, setCalendarBlocks] = useState<CalendarBlock[]>(INITIAL_BLOCKS);
  const [globalBaitMode, setGlobalBaitMode] = useState<boolean>(true);
  const [revealedTaskIds, setRevealedTaskIds] = useState<Record<string, boolean>>({});

  useEffect(() => {
    (async () => {
      const { status } = await Notifications.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Enable notifications to get status check-ins and deadline alerts.');
      }
      const saved = await AsyncStorage.getItem('@study_tracker_v1');
      if (saved) {
        const parsed = JSON.parse(saved);
        setModules(parsed.modules || INITIAL_MODULES);
        setTasks(parsed.tasks || INITIAL_TASKS);
        setCalendarBlocks(parsed.calendarBlocks || INITIAL_BLOCKS);
        setGlobalBaitMode(parsed.globalBaitMode ?? true);
      }
    })();
  }, []);

  useEffect(() => {
    AsyncStorage.setItem(
      '@study_tracker_v1',
      JSON.stringify({ modules, tasks, calendarBlocks, globalBaitMode })
    );
  }, [modules, tasks, calendarBlocks, globalBaitMode]);

  const getEffectiveDueDate = (task: Task) => {
    const actual = new Date(task.actualDueDate);
    if (globalBaitMode && task.baitEnabled) {
      const baited = new Date(actual.getTime() - 7 * 86400000);
      return baited.toISOString().split('T')[0];
    }
    return task.actualDueDate;
  };

  const triggerStatusCheckInNotification = async () => {
    const activeTasks = tasks.filter((t) => t.status !== 'Done');
    const firstTask = activeTasks[0];
    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Study Check-In: Status Update',
        body: firstTask
          ? `How is "${firstTask.title}" going? Tap to update your status!`
          : 'All tasks caught up! Time to review your PYPs.',
        sound: true,
      },
      trigger: {
  type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
  seconds: 2, // (or 5 for scheduleTaskNotification)
},
    });
    Alert.alert('Notification Scheduled', 'Lock your phone or wait 2 seconds to see the pop-up reminder.');
  };

  const scheduleTaskNotification = async (task: Task) => {
    const effectiveDate = getEffectiveDueDate(task);
    await Notifications.scheduleNotificationAsync({
      content: {
        title: task.baitEnabled && globalBaitMode ? 'Upcoming Deadline!' : 'Assignment Reminder',
        body: `"${task.title}" is due on ${effectiveDate}. Update your progress!`,
      },
      trigger: {
  type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
  seconds: 5, // (or 5 for scheduleTaskNotification)
},
    });
  };

  // --- SCREEN 1: TASKS & BAIT TRACKER ---
  const TasksScreen = () => {
    const [modalVisible, setModalVisible] = useState(false);
    const [newTitle, setNewTitle] = useState('');
    const [selectedModId, setSelectedModId] = useState(modules[0]?.id || 'm1');
    const [dueDateInput, setDueDateInput] = useState('2026-11-28');
    const [baitToggle, setBaitToggle] = useState(true);

    const cycleStatus = (id: string) => {
      const order: TaskStatus[] = ['Todo', 'In Progress', 'Done'];
      setTasks((prev) =>
        prev.map((t) => {
          if (t.id !== id) return t;
          const next = order[(order.indexOf(t.status) + 1) % order.length];
          return { ...t, status: next };
        })
      );
    };

    const addTask = async () => {
      if (!newTitle.trim()) return;
      const created: Task = {
        id: Date.now().toString(),
        moduleId: selectedModId,
        title: newTitle.trim(),
        status: 'Todo',
        actualDueDate: dueDateInput,
        baitEnabled: baitToggle,
      };
      setTasks([created, ...tasks]);
      setNewTitle('');
      setModalVisible(false);
      await scheduleTaskNotification(created);
    };

    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.headerRow}>
          <Text style={styles.headerTitle}>Task Tracker</Text>
          <TouchableOpacity style={styles.primaryBtn} onPress={() => setModalVisible(true)}>
            <Text style={styles.primaryBtnText}>+ Task</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.bannerCard}>
          <View style={styles.rowBetween}>
            <View style={{ flex: 1 }}>
              <Text style={styles.bannerTitle}>1-Week Early Bait Mode</Text>
              <Text style={styles.bannerSub}>
                {globalBaitMode
                  ? 'Active: Deadlines shown 7 days early'
                  : 'Off: Showing real university deadlines'}
              </Text>
            </View>
            <Switch
              value={globalBaitMode}
              onValueChange={setGlobalBaitMode}
              trackColor={{ false: THEME.secondary, true: THEME.primary }}
            />
          </View>
          <TouchableOpacity style={styles.secondaryBtn} onPress={triggerStatusCheckInNotification}>
            <Ionicons name="notifications-outline" size={16} color={THEME.primary} />
            <Text style={styles.secondaryBtnText}>Test Phone Status Pop-Up</Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={{ paddingBottom: 30 }}>
          {tasks.map((task) => {
            const mod = modules.find((m) => m.id === task.moduleId);
            const effectiveDate = getEffectiveDueDate(task);
            const isBaited = globalBaitMode && task.baitEnabled;
            const isRevealed = revealedTaskIds[task.id];

            return (
              <View key={task.id} style={styles.card}>
                <View style={styles.rowBetween}>
                  <Text style={styles.badge}>{mod?.code || 'GEN'}</Text>
                  <TouchableOpacity
                    style={[
                      styles.statusPill,
                      task.status === 'Done'
                        ? styles.statusDone
                        : task.status === 'In Progress'
                        ? styles.statusProgress
                        : styles.statusTodo,
                    ]}
                    onPress={() => cycleStatus(task.id)}
                  >
                    <Text style={styles.statusText}>{task.status} ↻</Text>
                  </TouchableOpacity>
                </View>

                <Text style={[styles.taskTitle, task.status === 'Done' && styles.strike]}>
                  {task.title}
                </Text>

                <View style={styles.rowBetween}>
                  <Text style={styles.dueText}>
                    Due:{' '}
                    <Text style={{ fontWeight: '700', color: isBaited ? THEME.accentAlert : THEME.primary }}>
                      {effectiveDate}
                    </Text>
                    {isBaited && !isRevealed ? ' (Baited -7d)' : ''}
                  </Text>

                  {isBaited && (
                    <TouchableOpacity
                      onPress={() =>
                        setRevealedTaskIds((p) => ({ ...p, [task.id]: !p[task.id] }))
                      }
                    >
                      <Text style={styles.linkText}>
                        {isRevealed ? `Real: ${task.actualDueDate}` : 'Peek Real Date'}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            );
          })}
        </ScrollView>

        <Modal visible={modalVisible} animationType="slide" transparent>
          <View style={styles.modalOverlay}>
            <View style={styles.modalBox}>
              <Text style={styles.modalTitle}>New Assignment / Task</Text>
              <TextInput
                style={styles.input}
                placeholder="Task title (e.g., Lab 3 Report)"
                placeholderTextColor={THEME.textMuted}
                value={newTitle}
                onChangeText={setNewTitle}
              />
              <Text style={styles.label}>Select Module:</Text>
              <View style={styles.chipRow}>
                {modules.map((m) => (
                  <TouchableOpacity
                    key={m.id}
                    style={[styles.chip, selectedModId === m.id && styles.chipActive]}
                    onPress={() => setSelectedModId(m.id)}
                  >
                    <Text style={selectedModId === m.id ? styles.chipTextActive : styles.chipText}>
                      {m.code}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={styles.label}>Actual Due Date (YYYY-MM-DD):</Text>
              <TextInput
                style={styles.input}
                value={dueDateInput}
                onChangeText={setDueDateInput}
                placeholder="2026-11-30"
                placeholderTextColor={THEME.textMuted}
              />
              <View style={[styles.rowBetween, { marginVertical: 10 }]}>
                <Text style={styles.label}>Bait me 1 week early on this task</Text>
                <Switch
                  value={baitToggle}
                  onValueChange={setBaitToggle}
                  trackColor={{ false: THEME.secondary, true: THEME.primary }}
                />
              </View>
              <View style={styles.rowBetween}>
                <TouchableOpacity onPress={() => setModalVisible(false)}>
                  <Text style={{ color: THEME.textMuted, fontWeight: '600' }}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.primaryBtn} onPress={addTask}>
                  <Text style={styles.primaryBtnText}>Save & Notify</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    );
  };

  // --- SCREEN 2: CALENDAR & TIMETABLE IMPORT ---
  const CalendarScreen = () => {
    const [selectedDay, setSelectedDay] = useState('Mon');
    const [blockModal, setBlockModal] = useState(false);
    const [title, setTitle] = useState('');
    const [start, setStart] = useState('16:00');
    const [end, setEnd] = useState('18:00');
    const [type, setType] = useState<'Study' | 'Personal' | 'Class'>('Study');

    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

    const handleImportICS = async () => {
      try {
        const res = await DocumentPicker.getDocumentAsync({ type: '*/*' });
        if (res.canceled) return;
        const fileUri = res.assets[0].uri;
        const content = await FileSystem.readAsStringAsync(fileUri);

        const events = content.split('BEGIN:VEVENT').slice(1);
        const imported: CalendarBlock[] = events.map((ev, idx) => {
          const summaryMatch = ev.match(/SUMMARY:(.*)/);
          const dtStartMatch = ev.match(/DTSTART.*:(\d{8}T\d{4})/);
          const dtEndMatch = ev.match(/DTEND.*:(\d{8}T\d{4})/);

          const rawSummary = summaryMatch ? summaryMatch[1].trim() : `Imported Class ${idx + 1}`;
          let dayStr = 'Mon';
          let startStr = '09:00';
          let endStr = '10:00';

          if (dtStartMatch) {
            const iso = dtStartMatch[1];
            const y = parseInt(iso.slice(0, 4), 10);
            const m = parseInt(iso.slice(4, 6), 10) - 1;
            const d = parseInt(iso.slice(6, 8), 10);
            const dt = new Date(y, m, d);
            dayStr = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dt.getDay()];
            startStr = `${iso.slice(9, 11)}:${iso.slice(11, 13)}`;
          }
          if (dtEndMatch) {
            const isoE = dtEndMatch[1];
            endStr = `${isoE.slice(9, 11)}:${isoE.slice(11, 13)}`;
          }

          return {
            id: `ics-${Date.now()}-${idx}`,
            title: rawSummary,
            day: dayStr,
            startTime: startStr,
            endTime: endStr,
            type: 'Class',
          };
        });

        if (imported.length > 0) {
          setCalendarBlocks((prev) => [...prev, ...imported]);
          Alert.alert('Timetable Imported', `Added ${imported.length} classes from your .ics file!`);
        } else {
          Alert.alert('No Events Found', 'Could not find valid VEVENT entries in that file.');
        }
      } catch (e) {
        Alert.alert('Import Error', 'Failed to read the .ics timetable file.');
      }
    };

    const addTimeBlock = () => {
      if (!title.trim()) return;
      setCalendarBlocks((prev) => [
        ...prev,
        {
          id: Date.now().toString(),
          title: title.trim(),
          day: selectedDay,
          startTime: start,
          endTime: end,
          type,
        },
      ]);
      setTitle('');
      setBlockModal(false);
    };

    const dayBlocks = calendarBlocks
      .filter((b) => b.day === selectedDay)
      .sort((a, b) => a.startTime.localeCompare(b.startTime));

    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.headerRow}>
          <Text style={styles.headerTitle}>Schedule</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity style={[styles.secondaryBtn, { marginTop: 0 }]} onPress={handleImportICS}>
              <Text style={styles.secondaryBtnText}>Import .ics</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.primaryBtn} onPress={() => setBlockModal(true)}>
              <Text style={styles.primaryBtnText}>+ Block Time</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.dayBar}>
          {days.map((d) => (
            <TouchableOpacity
              key={d}
              style={[styles.dayPill, selectedDay === d && styles.dayPillActive]}
              onPress={() => setSelectedDay(d)}
            >
              <Text style={selectedDay === d ? styles.dayTextActive : styles.dayText}>{d}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <ScrollView contentContainerStyle={{ paddingBottom: 30 }}>
          {dayBlocks.length === 0 ? (
            <Text style={styles.emptyText}>
              No blocks scheduled for {selectedDay}. Tap "+ Block Time" to plan a study session.
            </Text>
          ) : (
            dayBlocks.map((b) => (
              <View
                key={b.id}
                style={[
                  styles.card,
                  {
                    borderLeftWidth: 5,
                    borderLeftColor:
                      b.type === 'Class'
                        ? THEME.primary
                        : b.type === 'Study'
                        ? '#2E6F40'
                        : THEME.secondary,
                  },
                ]}
              >
                <View style={styles.rowBetween}>
                  <Text style={styles.timeText}>
                    {b.startTime} - {b.endTime}
                  </Text>
                  <Text style={styles.badge}>{b.type}</Text>
                </View>
                <Text style={styles.taskTitle}>{b.title}</Text>
              </View>
            ))
          )}
        </ScrollView>

        <Modal visible={blockModal} animationType="slide" transparent>
          <View style={styles.modalOverlay}>
            <View style={styles.modalBox}>
              <Text style={styles.modalTitle}>Block Out Time ({selectedDay})</Text>
              <TextInput
                style={styles.input}
                placeholder="Activity (e.g., Revise Lecture 5 / Gym)"
                placeholderTextColor={THEME.textMuted}
                value={title}
                onChangeText={setTitle}
              />
              <View style={styles.rowBetween}>
                <TextInput
                  style={[styles.input, { width: '48%' }]}
                  value={start}
                  onChangeText={setStart}
                  placeholder="Start (14:00)"
                  placeholderTextColor={THEME.textMuted}
                />
                <TextInput
                  style={[styles.input, { width: '48%' }]}
                  value={end}
                  onChangeText={setEnd}
                  placeholder="End (16:00)"
                  placeholderTextColor={THEME.textMuted}
                />
              </View>
              <View style={styles.chipRow}>
                {(['Study', 'Personal', 'Class'] as const).map((t) => (
                  <TouchableOpacity
                    key={t}
                    style={[styles.chip, type === t && styles.chipActive]}
                    onPress={() => setType(t)}
                  >
                    <Text style={type === t ? styles.chipTextActive : styles.chipText}>{t}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={[styles.rowBetween, { marginTop: 14 }]}>
                <TouchableOpacity onPress={() => setBlockModal(false)}>
                  <Text style={{ color: THEME.textMuted }}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.primaryBtn} onPress={addTimeBlock}>
                  <Text style={styles.primaryBtnText}>Save Block</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    );
  };

  // --- SCREEN 3: MODULES HUB (GRADED ITEMS, GPA, NOTES, TUTORIALS/PYPs) ---
  const ModulesScreen = () => {
    const [activeModId, setActiveModId] = useState<string>(modules[0]?.id || 'm1');
    const [subTab, setSubTab] = useState<'Grades' | 'Notes' | 'Tutorials/PYP'>('Grades');

    const [gName, setGName] = useState('');
    const [gWeight, setGWeight] = useState('');
    const [gScore, setGScore] = useState('');
    const [gMax, setGMax] = useState('100');

    const [resTitle, setResTitle] = useState('');
    const [resBody, setResBody] = useState('');
    const [resType, setResType] = useState<'Note' | 'Tutorial' | 'PYP'>('Note');

    const activeMod = modules.find((m) => m.id === activeModId) || modules[0];

    const calculateStats = (mod: Module) => {
      let earnedWeight = 0;
      let totalWeight = 0;
      mod.gradedItems.forEach((item) => {
        totalWeight += item.weight;
        earnedWeight += (item.score / item.maxScore) * item.weight;
      });
      const currentPct = totalWeight > 0 ? (earnedWeight / totalWeight) * 100 : 0;
      const gpaPoint =
        currentPct >= 85
          ? 5.0
          : currentPct >= 80
          ? 4.5
          : currentPct >= 75
          ? 4.0
          : currentPct >= 70
          ? 3.5
          : currentPct >= 65
          ? 3.0
          : 2.5;
      return {
        earnedWeight: earnedWeight.toFixed(1),
        totalWeight,
        currentPct: currentPct.toFixed(1),
        gpaPoint,
      };
    };

    const cumulativeGPA = useMemo(() => {
      let totalPoints = 0;
      let totalCredits = 0;
      modules.forEach((m) => {
        const { gpaPoint } = calculateStats(m);
        totalPoints += gpaPoint * m.credits;
        totalCredits += m.credits;
      });
      return totalCredits > 0 ? (totalPoints / totalCredits).toFixed(2) : '0.00';
    }, [modules]);

    const addGradedItem = () => {
      if (!gName || !gWeight || !gScore) return;
      setModules((prev) =>
        prev.map((m) =>
          m.id === activeMod.id
            ? {
                ...m,
                gradedItems: [
                  ...m.gradedItems,
                  {
                    id: Date.now().toString(),
                    name: gName,
                    weight: parseFloat(gWeight),
                    score: parseFloat(gScore),
                    maxScore: parseFloat(gMax) || 100,
                  },
                ],
              }
            : m
        )
      );
      setGName('');
      setGWeight('');
      setGScore('');
    };

    const addResource = () => {
      if (!resTitle.trim()) return;
      setModules((prev) =>
        prev.map((m) =>
          m.id === activeMod.id
            ? {
                ...m,
                resources: [
                  ...m.resources,
                  {
                    id: Date.now().toString(),
                    type: resType,
                    title: resTitle.trim(),
                    contentOrStatus: resType === 'Note' ? resBody || 'No details.' : 'Unattempted',
                  },
                ],
              }
            : m
        )
      );
      setResTitle('');
      setResBody('');
    };

    const togglePracticeStatus = (resId: string) => {
      const states = ['Unattempted', 'Needs Review', 'Mastered'];
      setModules((prev) =>
        prev.map((m) =>
          m.id === activeMod.id
            ? {
                ...m,
                resources: m.resources.map((r) => {
                  if (r.id !== resId) return r;
                  const next = states[(states.indexOf(r.contentOrStatus) + 1) % states.length];
                  return { ...r, contentOrStatus: next };
                }),
              }
            : m
        )
      );
    };

    const stats = calculateStats(activeMod);

    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.headerRow}>
          <Text style={styles.headerTitle}>Modules Hub</Text>
          <View style={styles.gpaBadge}>
            <Text style={styles.gpaBadgeText}>cGPA: {cumulativeGPA} / 5.0</Text>
          </View>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ maxHeight: 45, marginBottom: 10 }}>
          {modules.map((m) => (
            <TouchableOpacity
              key={m.id}
              style={[styles.chip, activeMod.id === m.id && styles.chipActive]}
              onPress={() => setActiveModId(m.id)}
            >
              <Text style={activeMod.id === m.id ? styles.chipTextActive : styles.chipText}>
                {m.code}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <View style={styles.bannerCard}>
          <Text style={styles.bannerTitle}>
            {activeMod.code}: {activeMod.name}
          </Text>
          <Text style={styles.bannerSub}>
            Current Standing: {stats.currentPct}% ({stats.earnedWeight}% / {stats.totalWeight}% graded) • Est. Grade Point: {stats.gpaPoint.toFixed(1)}
          </Text>
        </View>

        <View style={styles.subTabRow}>
          {(['Grades', 'Notes', 'Tutorials/PYP'] as const).map((tab) => (
            <TouchableOpacity
              key={tab}
              style={[styles.subTab, subTab === tab && styles.subTabActive]}
              onPress={() => setSubTab(tab)}
            >
              <Text style={subTab === tab ? styles.subTabTextActive : styles.subTabText}>{tab}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
          {subTab === 'Grades' && (
            <>
              {activeMod.gradedItems.map((g) => (
                <View key={g.id} style={styles.card}>
                  <View style={styles.rowBetween}>
                    <Text style={styles.taskTitle}>{g.name}</Text>
                    <Text style={styles.badge}>{g.weight}% Weight</Text>
                  </View>
                  <Text style={styles.dueText}>
                    Score: {g.score} / {g.maxScore} ({((g.score / g.maxScore) * 100).toFixed(1)}%)
                  </Text>
                </View>
              ))}

              <View style={styles.card}>
                <Text style={styles.label}>+ Add Graded Assessment</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Assessment Name (e.g. Lab 2)"
                  placeholderTextColor={THEME.textMuted}
                  value={gName}
                  onChangeText={setGName}
                />
                <View style={styles.rowBetween}>
                  <TextInput
                    style={[styles.input, { width: '31%' }]}
                    placeholder="Weight %"
                    placeholderTextColor={THEME.textMuted}
                    keyboardType="numeric"
                    value={gWeight}
                    onChangeText={setGWeight}
                  />
                  <TextInput
                    style={[styles.input, { width: '31%' }]}
                    placeholder="Score"
                    placeholderTextColor={THEME.textMuted}
                    keyboardType="numeric"
                    value={gScore}
                    onChangeText={setGScore}
                  />
                  <TextInput
                    style={[styles.input, { width: '31%' }]}
                    placeholder="Max (100)"
                    placeholderTextColor={THEME.textMuted}
                    keyboardType="numeric"
                    value={gMax}
                    onChangeText={setGMax}
                  />
                </View>
                <TouchableOpacity style={styles.primaryBtn} onPress={addGradedItem}>
                  <Text style={styles.primaryBtnText}>Add Graded Item</Text>
                </TouchableOpacity>
              </View>
            </>
          )}

          {subTab === 'Notes' && (
            <>
              {activeMod.resources
                .filter((r) => r.type === 'Note')
                .map((note) => (
                  <View key={note.id} style={styles.card}>
                    <Text style={styles.taskTitle}>{note.title}</Text>
                    <Text style={styles.noteBody}>{note.contentOrStatus}</Text>
                  </View>
                ))}
              <View style={styles.card}>
                <Text style={styles.label}>+ Add Study Note</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Topic / Lecture Title"
                  placeholderTextColor={THEME.textMuted}
                  value={resTitle}
                  onChangeText={(t) => {
                    setResType('Note');
                    setResTitle(t);
                  }}
                />
                <TextInput
                  style={[styles.input, { height: 70 }]}
                  multiline
                  placeholder="Key formulas, concepts, summaries..."
                  placeholderTextColor={THEME.textMuted}
                  value={resBody}
                  onChangeText={setResBody}
                />
                <TouchableOpacity style={styles.primaryBtn} onPress={addResource}>
                  <Text style={styles.primaryBtnText}>Save Note</Text>
                </TouchableOpacity>
              </View>
            </>
          )}

          {subTab === 'Tutorials/PYP' && (
            <>
              {activeMod.resources
                .filter((r) => r.type === 'Tutorial' || r.type === 'PYP')
                .map((item) => (
                  <View key={item.id} style={styles.card}>
                    <View style={styles.rowBetween}>
                      <View>
                        <Text style={styles.badge}>{item.type}</Text>
                        <Text style={[styles.taskTitle, { marginTop: 4 }]}>{item.title}</Text>
                      </View>
                      <TouchableOpacity
                        style={styles.statusPill}
                        onPress={() => togglePracticeStatus(item.id)}
                      >
                        <Text style={styles.statusText}>{item.contentOrStatus} ↻</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              <View style={styles.card}>
                <Text style={styles.label}>+ Track Tutorial or Past Year Paper</Text>
                <View style={styles.chipRow}>
                  {(['Tutorial', 'PYP'] as const).map((t) => (
                    <TouchableOpacity
                      key={t}
                      style={[styles.chip, resType === t && styles.chipActive]}
                      onPress={() => setResType(t)}
                    >
                      <Text style={resType === t ? styles.chipTextActive : styles.chipText}>{t}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <TextInput
                  style={styles.input}
                  placeholder="e.g., Tutorial 6 or AY24/25 Finals"
                  placeholderTextColor={THEME.textMuted}
                  value={resTitle}
                  onChangeText={setResTitle}
                />
                <TouchableOpacity style={styles.primaryBtn} onPress={addResource}>
                  <Text style={styles.primaryBtnText}>Add to Revision List</Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    );
  };

  // --- MAIN NAVIGATION ---
  return (
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={({ route }) => ({
          headerShown: false,
          tabBarActiveTintColor: THEME.primary,
          tabBarInactiveTintColor: THEME.textMuted,
          tabBarStyle: {
            backgroundColor: THEME.surface,
            borderTopColor: THEME.secondary,
          },
          tabBarIcon: ({ color, size }) => {
            const iconName =
              route.name === 'Tasks'
                ? 'checkbox-outline'
                : route.name === 'Calendar'
                ? 'calendar-outline'
                : 'book-outline';
            return <Ionicons name={iconName as any} size={size} color={color} />;
          },
        })}
      >
        <Tab.Screen name="Tasks" component={TasksScreen} />
        <Tab.Screen name="Calendar" component={CalendarScreen} />
        <Tab.Screen name="Modules" component={ModulesScreen} />
      </Tab.Navigator>
    </NavigationContainer>
  );
}

// --- STYLES ---
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: THEME.background, paddingHorizontal: 16, paddingTop: Platform.OS === 'android' ? 35 : 10 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  headerTitle: { fontSize: 24, fontWeight: '800', color: THEME.primary },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  bannerCard: { backgroundColor: '#E4E6E1', padding: 14, borderRadius: 12, marginBottom: 14, borderWidth: 1, borderColor: THEME.secondary },
  bannerTitle: { fontSize: 15, fontWeight: '700', color: THEME.primary },
  bannerSub: { fontSize: 12, color: THEME.textMuted, marginTop: 2 },
  card: { backgroundColor: THEME.surface, padding: 14, borderRadius: 12, marginBottom: 10, borderWidth: 1, borderColor: '#E5E7E3', shadowColor: THEME.primary, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1 },
  taskTitle: { fontSize: 16, fontWeight: '700', color: THEME.primary, marginVertical: 6 },
  strike: { textDecorationLine: 'line-through', color: THEME.textMuted },
  dueText: { fontSize: 13, color: THEME.textMuted },
  timeText: { fontSize: 13, fontWeight: '700', color: THEME.primary },
  linkText: { fontSize: 12, color: THEME.primary, fontWeight: '700', textDecorationLine: 'underline' },
  badge: { backgroundColor: THEME.secondary, color: THEME.primary, fontSize: 11, fontWeight: '700', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, alignSelf: 'flex-start' },
  gpaBadge: { backgroundColor: THEME.primary, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  gpaBadgeText: { color: THEME.secondary, fontWeight: '800', fontSize: 13 },
  statusPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, backgroundColor: THEME.secondary },
  statusTodo: { backgroundColor: '#FADBD8' },
  statusProgress: { backgroundColor: THEME.secondary },
  statusDone: { backgroundColor: '#D4EFDF' },
  statusText: { fontSize: 12, fontWeight: '700', color: THEME.primary },
  primaryBtn: { backgroundColor: THEME.primary, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, alignItems: 'center' },
  primaryBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 13 },
  secondaryBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: THEME.secondary, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, marginTop: 10, alignSelf: 'flex-start' },
  secondaryBtnText: { color: THEME.primary, fontWeight: '700', fontSize: 12 },
  dayBar: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  dayPill: { paddingVertical: 8, paddingHorizontal: 10, borderRadius: 8, backgroundColor: THEME.secondary },
  dayPillActive: { backgroundColor: THEME.primary },
  dayText: { fontSize: 12, fontWeight: '600', color: THEME.primary },
  dayTextActive: { fontSize: 12, fontWeight: '700', color: '#FFFFFF' },
  subTabRow: { flexDirection: 'row', backgroundColor: THEME.secondary, borderRadius: 10, padding: 3, marginBottom: 12 },
  subTab: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 8 },
  subTabActive: { backgroundColor: THEME.primary },
  subTabText: { fontSize: 13, fontWeight: '600', color: THEME.primary },
  subTabTextActive: { fontSize: 13, fontWeight: '700', color: '#FFFFFF' },
  chipRow: { flexDirection: 'row', gap: 8, marginVertical: 6 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: THEME.secondary, marginRight: 6 },
  chipActive: { backgroundColor: THEME.primary },
  chipText: { fontSize: 12, fontWeight: '600', color: THEME.primary },
  chipTextActive: { fontSize: 12, fontWeight: '700', color: '#FFFFFF' },
  noteBody: { fontSize: 14, color: THEME.textMuted, lineHeight: 20 },
  emptyText: { textAlign: 'center', color: THEME.textMuted, marginTop: 30, fontSize: 14 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(35, 50, 74, 0.55)', justifyContent: 'center', padding: 20 },
  modalBox: { backgroundColor: THEME.surface, borderRadius: 14, padding: 18, borderWidth: 1, borderColor: THEME.secondary },
  modalTitle: { fontSize: 18, fontWeight: '800', marginBottom: 12, color: THEME.primary },
  label: { fontSize: 13, fontWeight: '700', color: THEME.primary, marginBottom: 6 },
  input: { borderWidth: 1, borderColor: THEME.secondary, borderRadius: 8, padding: 10, marginBottom: 10, fontSize: 14, backgroundColor: THEME.background, color: THEME.primary },
});