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
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
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

// --- GRADE POINT SCALE (5.0 SYSTEM) ---
const GRADE_POINTS: Record<string, number> = {
  'A+': 5.0,
  'A': 5.0,
  'A-': 4.5,
  'B+': 4.0,
  'B': 3.5,
  'B-': 3.0,
  'C+': 2.5,
  'C': 2.0,
  'D+': 1.5,
  'D': 1.0,
  'F': 0.0,
};

const GRADE_OPTIONS = ['Auto', 'A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'D+', 'D', 'F'];

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
type RevisionStatus = 'Unattempted' | 'Needs Review' | 'Mastered';

interface Task {
  id: string;
  moduleId: string;
  title: string;
  status: TaskStatus;
  actualDueDate: string;
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
  pdfUri?: string;
  pdfName?: string;
}

interface Module {
  id: string;
  code: string;
  name: string;
  credits: number; // Academic Units (AU)
  manualGrade?: string; // Optional override e.g. 'A-' or 'Auto'
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
    manualGrade: 'Auto',
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
    manualGrade: 'Auto',
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

const HOURS = [
  '08:00', '09:00', '10:00', '11:00', '12:00', '13:00',
  '14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00', '21:00',
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
      const saved = await AsyncStorage.getItem('@study_tracker_v3');
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
      '@study_tracker_v3',
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
        seconds: 2,
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
        seconds: 5,
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

    const setTaskStatus = (id: string, status: TaskStatus) => {
      setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, status } : t)));
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
                  <Text style={styles.dueText}>
                    Due:{' '}
                    <Text style={{ fontWeight: '700', color: isBaited ? THEME.accentAlert : THEME.primary }}>
                      {effectiveDate}
                    </Text>
                    {isBaited && !isRevealed ? ' (-7d)' : ''}
                  </Text>
                </View>

                <Text style={[styles.taskTitle, task.status === 'Done' && styles.strike]}>
                  {task.title}
                </Text>

                <View style={styles.statusSelectorRow}>
                  {(['Todo', 'In Progress', 'Done'] as TaskStatus[]).map((st) => {
                    const active = task.status === st;
                    return (
                      <TouchableOpacity
                        key={st}
                        style={[
                          styles.statusOptionBtn,
                          active &&
                            (st === 'Done'
                              ? styles.statusDoneActive
                              : st === 'In Progress'
                              ? styles.statusProgressActive
                              : styles.statusTodoActive),
                        ]}
                        onPress={() => setTaskStatus(task.id, st)}
                      >
                        <Text style={[styles.statusOptionText, active && { color: '#FFFFFF' }]}>
                          {st}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {isBaited && (
                  <TouchableOpacity
                    style={{ marginTop: 8, alignSelf: 'flex-end' }}
                    onPress={() =>
                      setRevealedTaskIds((p) => ({ ...p, [task.id]: !p[task.id] }))
                    }
                  >
                    <Text style={styles.linkText}>
                      {isRevealed ? `Real Deadline: ${task.actualDueDate}` : 'Peek Real Date'}
                    </Text>
                  </TouchableOpacity>
                )}
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

  // --- SCREEN 2: INTERACTIVE TIME-BLOCKING CALENDAR & TIMETABLE IMPORT ---
  const CalendarScreen = () => {
    const [selectedDay, setSelectedDay] = useState('Mon');
    const [blockModal, setBlockModal] = useState(false);
    const [title, setTitle] = useState('');
    const [start, setStart] = useState('14:00');
    const [durationHours, setDurationHours] = useState<number>(1);
    const [type, setType] = useState<'Study' | 'Personal' | 'Class'>('Study');

    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

    const computeEndTime = (startStr: string, hrs: number) => {
      const [hStr, mStr] = startStr.split(':');
      const startH = parseInt(hStr || '9', 10);
      const endH = Math.min(23, startH + hrs);
      return `${endH.toString().padStart(2, '0')}:${mStr || '00'}`;
    };

    const openSlotPicker = (hourStr: string) => {
      setStart(hourStr);
      setDurationHours(1);
      setTitle('');
      setType('Study');
      setBlockModal(true);
    };

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
      const finalTitle = title.trim() || `${type} Session`;
      const end = computeEndTime(start, durationHours);
      setCalendarBlocks((prev) => [
        ...prev,
        {
          id: Date.now().toString(),
          title: finalTitle,
          day: selectedDay,
          startTime: start,
          endTime: end,
          type,
        },
      ]);
      setTitle('');
      setBlockModal(false);
    };

    const deleteBlock = (id: string) => {
      Alert.alert('Remove Time Block', 'Delete this scheduled block?', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => setCalendarBlocks((prev) => prev.filter((b) => b.id !== id)),
        },
      ]);
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
            <TouchableOpacity style={styles.primaryBtn} onPress={() => openSlotPicker('14:00')}>
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

        <Text style={styles.helperHint}>Tap any empty hour slot below to block out study or personal time:</Text>

        <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
          {HOURS.map((hour) => {
            const hourInt = parseInt(hour.split(':')[0], 10);
            const matchingBlocks = dayBlocks.filter((b) => {
              const bStart = parseInt(b.startTime.split(':')[0], 10);
              const bEnd = parseInt(b.endTime.split(':')[0], 10);
              return hourInt >= bStart && hourInt < Math.max(bStart + 1, bEnd);
            });

            return (
              <View key={hour} style={styles.hourRow}>
                <Text style={styles.hourLabel}>{hour}</Text>
                <View style={{ flex: 1 }}>
                  {matchingBlocks.length > 0 ? (
                    matchingBlocks.map((b) => (
                      <TouchableOpacity
                        key={`${b.id}-${hour}`}
                        onLongPress={() => deleteBlock(b.id)}
                        style={[
                          styles.timelineBlock,
                          {
                            backgroundColor:
                              b.type === 'Class'
                                ? THEME.primary
                                : b.type === 'Study'
                                ? '#2E6F40'
                                : '#6B7280',
                          },
                        ]}
                      >
                        <View style={styles.rowBetween}>
                          <Text style={styles.timelineBlockTitle}>{b.title}</Text>
                          <TouchableOpacity onPress={() => deleteBlock(b.id)}>
                            <Ionicons name="close-circle" size={18} color="#FFFFFF" />
                          </TouchableOpacity>
                        </View>
                        <Text style={styles.timelineBlockSub}>
                          {b.startTime} - {b.endTime} • {b.type}
                        </Text>
                      </TouchableOpacity>
                    ))
                  ) : (
                    <TouchableOpacity
                      style={styles.emptySlotBtn}
                      onPress={() => openSlotPicker(hour)}
                    >
                      <Text style={styles.emptySlotText}>+ Tap to block {hour}</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            );
          })}
        </ScrollView>

        <Modal visible={blockModal} animationType="slide" transparent>
          <View style={styles.modalOverlay}>
            <View style={styles.modalBox}>
              <Text style={styles.modalTitle}>Block Out Time ({selectedDay})</Text>

              <Text style={styles.label}>Activity / Study Focus:</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g., CS2040S Revision / Gym / Break"
                placeholderTextColor={THEME.textMuted}
                value={title}
                onChangeText={setTitle}
              />

              <Text style={styles.label}>Start Time:</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
                {HOURS.map((h) => (
                  <TouchableOpacity
                    key={h}
                    style={[styles.chip, start === h && styles.chipActive]}
                    onPress={() => setStart(h)}
                  >
                    <Text style={start === h ? styles.chipTextActive : styles.chipText}>{h}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <Text style={styles.label}>Duration:</Text>
              <View style={styles.chipRow}>
                {[1, 2, 3, 4].map((hrs) => (
                  <TouchableOpacity
                    key={hrs}
                    style={[styles.chip, durationHours === hrs && styles.chipActive]}
                    onPress={() => setDurationHours(hrs)}
                  >
                    <Text style={durationHours === hrs ? styles.chipTextActive : styles.chipText}>
                      {hrs} {hrs === 1 ? 'hr' : 'hrs'} ({start} - {computeEndTime(start, hrs)})
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={[styles.label, { marginTop: 8 }]}>Block Type:</Text>
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

              <View style={[styles.rowBetween, { marginTop: 16 }]}>
                <TouchableOpacity onPress={() => setBlockModal(false)}>
                  <Text style={{ color: THEME.textMuted, fontWeight: '600' }}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.primaryBtn} onPress={addTimeBlock}>
                  <Text style={styles.primaryBtnText}>Save Time Block</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    );
  };

  // --- SCREEN 3: MODULES HUB (CGPA TRANSCRIPT TABLE, PDF UPLOADS, GRADES, NOTES, TUTORIALS/PYPs) ---
  const ModulesScreen = () => {
    const [activeModId, setActiveModId] = useState<string>(modules[0]?.id || 'm1');
    const [subTab, setSubTab] = useState<'Grades' | 'Notes' | 'Tutorials/PYP'>('Notes');

    // cGPA Transcript Modal & Add Module inputs
    const [cgpaModalVisible, setCgpaModalVisible] = useState(false);
    const [newModCode, setNewModCode] = useState('');
    const [newModName, setNewModName] = useState('');
    const [newModAU, setNewModAU] = useState('4');
    const [newModGrade, setNewModGrade] = useState('Auto');

    // Add Graded Item inputs
    const [gName, setGName] = useState('');
    const [gWeight, setGWeight] = useState('');
    const [gScore, setGScore] = useState('');
    const [gMax, setGMax] = useState('100');

    // Add Resource + PDF Attachment inputs
    const [resTitle, setResTitle] = useState('');
    const [resBody, setResBody] = useState('');
    const [resType, setResType] = useState<'Note' | 'Tutorial' | 'PYP'>('Note');
    const [attachedPdf, setAttachedPdf] = useState<{ uri: string; name: string } | null>(null);

    const activeMod = modules.find((m) => m.id === activeModId) || modules[0];

    // Calculate Module Percentage, Letter Grade, and 5.0 Grade Point
    const calculateStats = (mod: Module) => {
      let earnedWeight = 0;
      let totalWeight = 0;
      mod.gradedItems.forEach((item) => {
        totalWeight += item.weight;
        earnedWeight += (item.score / item.maxScore) * item.weight;
      });
      const currentPct = totalWeight > 0 ? (earnedWeight / totalWeight) * 100 : 0;

      // Auto-derived letter grade from percentage
      const autoLetter =
        currentPct >= 85
          ? 'A+'
          : currentPct >= 80
          ? 'A'
          : currentPct >= 75
          ? 'A-'
          : currentPct >= 70
          ? 'B+'
          : currentPct >= 65
          ? 'B'
          : currentPct >= 60
          ? 'B-'
          : currentPct >= 55
          ? 'C+'
          : currentPct >= 50
          ? 'C'
          : 'D';

      const effectiveLetter =
        mod.manualGrade && mod.manualGrade !== 'Auto' ? mod.manualGrade : autoLetter;
      const gpaPoint = GRADE_POINTS[effectiveLetter] ?? 4.0;

      return {
        earnedWeight: earnedWeight.toFixed(1),
        totalWeight,
        currentPct: currentPct.toFixed(1),
        effectiveLetter,
        gpaPoint,
      };
    };

    // Cumulative GPA & Total AUs across all modules
    const { cumulativeGPA, totalAUs } = useMemo(() => {
      let totalPoints = 0;
      let totalCredits = 0;
      modules.forEach((m) => {
        const { gpaPoint } = calculateStats(m);
        totalPoints += gpaPoint * m.credits;
        totalCredits += m.credits;
      });
      return {
        cumulativeGPA: totalCredits > 0 ? (totalPoints / totalCredits).toFixed(2) : '0.00',
        totalAUs: totalCredits,
      };
    }, [modules]);

    // Add new module to cGPA table
    const addNewModule = () => {
      if (!newModCode.trim()) return;
      const created: Module = {
        id: `m-${Date.now()}`,
        code: newModCode.trim().toUpperCase(),
        name: newModName.trim() || 'University Module',
        credits: parseInt(newModAU, 10) || 4,
        manualGrade: newModGrade,
        gradedItems: [],
        resources: [],
      };
      setModules((prev) => [...prev, created]);
      setActiveModId(created.id);
      setNewModCode('');
      setNewModName('');
      setNewModAU('4');
      setNewModGrade('Auto');
    };

    const cycleModuleGrade = (modId: string) => {
      setModules((prev) =>
        prev.map((m) => {
          if (m.id !== modId) return m;
          const current = m.manualGrade || 'Auto';
          const next = GRADE_OPTIONS[(GRADE_OPTIONS.indexOf(current) + 1) % GRADE_OPTIONS.length];
          return { ...m, manualGrade: next };
        })
      );
    };

    const deleteModule = (modId: string) => {
      if (modules.length <= 1) {
        Alert.alert('Cannot Delete', 'Keep at least one module in your tracker.');
        return;
      }
      setModules((prev) => {
        const filtered = prev.filter((m) => m.id !== modId);
        if (activeModId === modId) setActiveModId(filtered[0].id);
        return filtered;
      });
    };

    // Pick PDF file from phone storage/iCloud/Drive
    const handlePickPDF = async () => {
      try {
        const res = await DocumentPicker.getDocumentAsync({
          type: 'application/pdf',
          copyToCacheDirectory: true,
        });
        if (res.canceled) return;
        const asset = res.assets[0];

        // Persist inside app documentDirectory so it stays available across restarts
        const safeName = `${Date.now()}_${asset.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
        const destUri = `${FileSystem.documentDirectory}${safeName}`;
        await FileSystem.copyAsync({ from: asset.uri, to: destUri });

        setAttachedPdf({ uri: destUri, name: asset.name });
        if (!resTitle.trim()) {
          setResTitle(asset.name.replace(/\.pdf$/i, ''));
        }
      } catch (e) {
        Alert.alert('PDF Upload Failed', 'Could not attach that PDF file.');
      }
    };

    // Open uploaded PDF using native iOS/Android viewer sheet
    const openAttachedPDF = async (uri?: string) => {
      if (!uri) return;
      try {
        const canShare = await Sharing.isAvailableAsync();
        if (canShare) {
          await Sharing.shareAsync(uri, { mimeType: 'application/pdf' });
        } else {
          Alert.alert('Unavailable', 'PDF viewer is not available on this device.');
        }
      } catch (e) {
        Alert.alert('Error', 'Unable to open this PDF file.');
      }
    };

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

    const addResource = (forcedType?: 'Note' | 'Tutorial' | 'PYP') => {
      const targetType = forcedType || resType;
      if (!resTitle.trim() && !attachedPdf) return;
      setModules((prev) =>
        prev.map((m) =>
          m.id === activeMod.id
            ? {
                ...m,
                resources: [
                  ...m.resources,
                  {
                    id: Date.now().toString(),
                    type: targetType,
                    title: resTitle.trim() || attachedPdf?.name || 'Untitled PDF',
                    contentOrStatus:
                      targetType === 'Note'
                        ? resBody.trim() || (attachedPdf ? 'PDF Lecture Note attached.' : 'No notes added.')
                        : 'Unattempted',
                    pdfUri: attachedPdf?.uri,
                    pdfName: attachedPdf?.name,
                  },
                ],
              }
            : m
        )
      );
      setResTitle('');
      setResBody('');
      setAttachedPdf(null);
    };

    const setPracticeStatus = (resId: string, newStatus: RevisionStatus) => {
      setModules((prev) =>
        prev.map((m) =>
          m.id === activeMod.id
            ? {
                ...m,
                resources: m.resources.map((r) =>
                  r.id === resId ? { ...r, contentOrStatus: newStatus } : r
                ),
              }
            : m
        )
      );
    };

    const deleteResource = (resId: string) => {
      setModules((prev) =>
        prev.map((m) =>
          m.id === activeMod.id
            ? { ...m, resources: m.resources.filter((r) => r.id !== resId) }
            : m
        )
      );
    };

    const stats = calculateStats(activeMod);

    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.headerRow}>
          <Text style={styles.headerTitle}>Modules Hub</Text>
          {/* Tappable cGPA Pill */}
          <TouchableOpacity
            style={styles.gpaBadge}
            onPress={() => setCgpaModalVisible(true)}
            activeOpacity={0.8}
          >
            <Text style={styles.gpaBadgeText}>cGPA: {cumulativeGPA} / 5.0 ▾</Text>
          </TouchableOpacity>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ maxHeight: 45, marginBottom: 10 }}>
          {modules.map((m) => (
            <TouchableOpacity
              key={m.id}
              style={[styles.chip, activeMod.id === m.id && styles.chipActive]}
              onPress={() => setActiveModId(m.id)}
            >
              <Text style={activeMod.id === m.id ? styles.chipTextActive : styles.chipText}>
                {m.code} ({m.credits} AU)
              </Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity
            style={[styles.chip, { borderWidth: 1, borderStyle: 'dashed', borderColor: THEME.primary }]}
            onPress={() => setCgpaModalVisible(true)}
          >
            <Text style={styles.chipText}>+ Mod / Table</Text>
          </TouchableOpacity>
        </ScrollView>

        <View style={styles.bannerCard}>
          <Text style={styles.bannerTitle}>
            {activeMod.code}: {activeMod.name} ({activeMod.credits} AU)
          </Text>
          <Text style={styles.bannerSub}>
            Standing: {stats.currentPct}% ({stats.earnedWeight}% / {stats.totalWeight}% graded) • Grade: {stats.effectiveLetter} ({stats.gpaPoint.toFixed(1)})
          </Text>
        </View>

        <View style={styles.subTabRow}>
          {(['Grades', 'Notes', 'Tutorials/PYP'] as const).map((tab) => (
            <TouchableOpacity
              key={tab}
              style={[styles.subTab, subTab === tab && styles.subTabActive]}
              onPress={() => {
                setSubTab(tab);
                setAttachedPdf(null);
                if (tab === 'Notes') setResType('Note');
                if (tab === 'Tutorials/PYP') setResType('Tutorial');
              }}
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
                    <View style={styles.rowBetween}>
                      <Text style={styles.taskTitle}>{note.title}</Text>
                      <TouchableOpacity onPress={() => deleteResource(note.id)}>
                        <Ionicons name="trash-outline" size={18} color={THEME.textMuted} />
                      </TouchableOpacity>
                    </View>
                    <Text style={styles.noteBody}>{note.contentOrStatus}</Text>

                    {note.pdfUri && (
                      <TouchableOpacity
                        style={styles.pdfChipBtn}
                        onPress={() => openAttachedPDF(note.pdfUri)}
                      >
                        <Ionicons name="document-text" size={16} color={THEME.primary} />
                        <Text style={styles.pdfChipText} numberOfLines={1}>
                          Open PDF: {note.pdfName || 'Lecture_Notes.pdf'}
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                ))}

              <View style={styles.card}>
                <Text style={styles.label}>+ Add Study Note / Upload Lecture PDF</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Lecture / Topic Title"
                  placeholderTextColor={THEME.textMuted}
                  value={resTitle}
                  onChangeText={setResTitle}
                />
                <TextInput
                  style={[styles.input, { height: 65 }]}
                  multiline
                  placeholder="Summary notes (optional if uploading PDF)..."
                  placeholderTextColor={THEME.textMuted}
                  value={resBody}
                  onChangeText={setResBody}
                />

                <TouchableOpacity style={styles.uploadOutlineBtn} onPress={handlePickPDF}>
                  <Ionicons name="cloud-upload-outline" size={18} color={THEME.primary} />
                  <Text style={styles.uploadOutlineText}>
                    {attachedPdf ? `Attached: ${attachedPdf.name}` : 'Upload Lecture Notes PDF'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.primaryBtn} onPress={() => addResource('Note')}>
                  <Text style={styles.primaryBtnText}>Save Note & PDF</Text>
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
                      <Text style={styles.badge}>{item.type}</Text>
                      <TouchableOpacity onPress={() => deleteResource(item.id)}>
                        <Ionicons name="trash-outline" size={18} color={THEME.textMuted} />
                      </TouchableOpacity>
                    </View>
                    <Text style={styles.taskTitle}>{item.title}</Text>

                    {item.pdfUri && (
                      <TouchableOpacity
                        style={[styles.pdfChipBtn, { marginBottom: 8 }]}
                        onPress={() => openAttachedPDF(item.pdfUri)}
                      >
                        <Ionicons name="document-text" size={16} color={THEME.primary} />
                        <Text style={styles.pdfChipText} numberOfLines={1}>
                          Open PDF: {item.pdfName || 'Worksheet.pdf'}
                        </Text>
                      </TouchableOpacity>
                    )}

                    <View style={styles.statusSelectorRow}>
                      {(['Unattempted', 'Needs Review', 'Mastered'] as RevisionStatus[]).map((st) => {
                        const isSelected = item.contentOrStatus === st;
                        return (
                          <TouchableOpacity
                            key={st}
                            style={[
                              styles.statusOptionBtn,
                              isSelected &&
                                (st === 'Mastered'
                                  ? styles.statusDoneActive
                                  : st === 'Needs Review'
                                  ? styles.statusProgressActive
                                  : styles.statusTodoActive),
                            ]}
                            onPress={() => setPracticeStatus(item.id, st)}
                          >
                            <Text
                              style={[
                                styles.statusOptionText,
                                isSelected && { color: '#FFFFFF' },
                              ]}
                            >
                              {st}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                ))}

              <View style={styles.card}>
                <Text style={styles.label}>+ Add Tutorial / PYP & Upload PDF</Text>
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

                <TouchableOpacity style={styles.uploadOutlineBtn} onPress={handlePickPDF}>
                  <Ionicons name="cloud-upload-outline" size={18} color={THEME.primary} />
                  <Text style={styles.uploadOutlineText}>
                    {attachedPdf ? `Attached: ${attachedPdf.name}` : 'Upload Tutorial / PYP PDF'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.primaryBtn} onPress={() => addResource()}>
                  <Text style={styles.primaryBtnText}>Add to Revision List</Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </ScrollView>

        {/* CGPA TRANSCRIPT TABLE MODAL */}
        <Modal visible={cgpaModalVisible} animationType="slide" transparent>
          <View style={styles.modalOverlay}>
            <View style={[styles.modalBox, { maxHeight: '88%' }]}>
              <View style={styles.rowBetween}>
                <Text style={styles.modalTitle}>cGPA & Modules Transcript</Text>
                <TouchableOpacity onPress={() => setCgpaModalVisible(false)}>
                  <Ionicons name="close" size={24} color={THEME.primary} />
                </TouchableOpacity>
              </View>

              {/* Summary Strip */}
              <View style={styles.transcriptSummary}>
                <View>
                  <Text style={styles.summaryLabel}>Cumulative GPA</Text>
                  <Text style={styles.summaryValue}>{cumulativeGPA} / 5.00</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={styles.summaryLabel}>Total Academic Units</Text>
                  <Text style={styles.summaryValue}>{totalAUs} AU</Text>
                </View>
              </View>

              {/* Table Header */}
              <View style={styles.tableHeader}>
                <Text style={[styles.tableHeaderCell, { flex: 2.2 }]}>Module</Text>
                <Text style={[styles.tableHeaderCell, { flex: 0.8, textAlign: 'center' }]}>AU</Text>
                <Text style={[styles.tableHeaderCell, { flex: 1.2, textAlign: 'center' }]}>Grade</Text>
                <Text style={[styles.tableHeaderCell, { flex: 0.8, textAlign: 'right' }]}>Pt</Text>
              </View>

              {/* Table Rows */}
              <ScrollView style={{ maxHeight: 240 }}>
                {modules.map((m) => {
                  const mStats = calculateStats(m);
                  return (
                    <View key={m.id} style={styles.tableRow}>
                      <View style={{ flex: 2.2, paddingRight: 4 }}>
                        <Text style={styles.tableCode}>{m.code}</Text>
                        <Text style={styles.tableSubName} numberOfLines={1}>
                          {m.name}
                        </Text>
                      </View>
                      <Text style={[styles.tableCell, { flex: 0.8, textAlign: 'center' }]}>
                        {m.credits}
                      </Text>
                      <View style={{ flex: 1.2, alignItems: 'center' }}>
                        <TouchableOpacity
                          style={styles.gradeTapPill}
                          onPress={() => cycleModuleGrade(m.id)}
                        >
                          <Text style={styles.gradeTapText}>
                            {mStats.effectiveLetter} ↻
                          </Text>
                        </TouchableOpacity>
                      </View>
                      <View style={{ flex: 0.8, flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 6 }}>
                        <Text style={styles.tableCell}>{mStats.gpaPoint.toFixed(1)}</Text>
                        <TouchableOpacity onPress={() => deleteModule(m.id)}>
                          <Ionicons name="trash-outline" size={15} color={THEME.accentAlert} />
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })}
              </ScrollView>
              <Text style={styles.helperHint}>Tip: Tap any Grade pill (e.g. A- ↻) to manually override its grade.</Text>

              {/* Add Module Form inside Transcript */}
              <View style={styles.divider} />
              <Text style={styles.label}>+ Add Module to Transcript</Text>
              <View style={styles.rowBetween}>
                <TextInput
                  style={[styles.input, { width: '34%' }]}
                  placeholder="Code (CS1010)"
                  placeholderTextColor={THEME.textMuted}
                  value={newModCode}
                  onChangeText={setNewModCode}
                />
                <TextInput
                  style={[styles.input, { width: '42%' }]}
                  placeholder="Module Name"
                  placeholderTextColor={THEME.textMuted}
                  value={newModName}
                  onChangeText={setNewModName}
                />
                <TextInput
                  style={[styles.input, { width: '20%' }]}
                  placeholder="AU (4)"
                  placeholderTextColor={THEME.textMuted}
                  keyboardType="numeric"
                  value={newModAU}
                  onChangeText={setNewModAU}
                />
              </View>

              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
                {GRADE_OPTIONS.map((g) => (
                  <TouchableOpacity
                    key={g}
                    style={[styles.chip, newModGrade === g && styles.chipActive]}
                    onPress={() => setNewModGrade(g)}
                  >
                    <Text style={newModGrade === g ? styles.chipTextActive : styles.chipText}>
                      {g === 'Auto' ? 'Auto (from CA)' : g}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <TouchableOpacity style={styles.primaryBtn} onPress={addNewModule}>
                <Text style={styles.primaryBtnText}>Add Module</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
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
  linkText: { fontSize: 12, color: THEME.primary, fontWeight: '700', textDecorationLine: 'underline' },
  badge: { backgroundColor: THEME.secondary, color: THEME.primary, fontSize: 11, fontWeight: '700', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, alignSelf: 'flex-start' },
  gpaBadge: { backgroundColor: THEME.primary, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  gpaBadgeText: { color: THEME.secondary, fontWeight: '800', fontSize: 13 },

  // Status selector buttons
  statusSelectorRow: { flexDirection: 'row', gap: 6, marginTop: 8 },
  statusOptionBtn: { flex: 1, paddingVertical: 7, borderRadius: 8, backgroundColor: '#ECEEE9', alignItems: 'center', borderWidth: 1, borderColor: THEME.secondary },
  statusTodoActive: { backgroundColor: '#991B1B', borderColor: '#991B1B' },
  statusProgressActive: { backgroundColor: '#B45309', borderColor: '#B45309' },
  statusDoneActive: { backgroundColor: '#2E6F40', borderColor: '#2E6F40' },
  statusOptionText: { fontSize: 11, fontWeight: '700', color: THEME.primary },

  // PDF upload & open chips
  uploadOutlineBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1.5, borderStyle: 'dashed', borderColor: THEME.primary, borderRadius: 8, paddingVertical: 10, marginBottom: 10, backgroundColor: '#F8F9F7' },
  uploadOutlineText: { fontSize: 13, fontWeight: '700', color: THEME.primary },
  pdfChipBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#E4E6E1', paddingHorizontal: 10, paddingVertical: 8, borderRadius: 8, marginTop: 8, borderWidth: 1, borderColor: THEME.secondary },
  pdfChipText: { fontSize: 12, fontWeight: '700', color: THEME.primary, flex: 1 },

  // cGPA Transcript Table Styles
  transcriptSummary: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: THEME.primary, padding: 12, borderRadius: 10, marginBottom: 12 },
  summaryLabel: { fontSize: 11, color: THEME.secondary, fontWeight: '600' },
  summaryValue: { fontSize: 18, color: '#FFFFFF', fontWeight: '800', marginTop: 2 },
  tableHeader: { flexDirection: 'row', backgroundColor: THEME.secondary, paddingVertical: 8, paddingHorizontal: 10, borderTopLeftRadius: 8, borderTopRightRadius: 8 },
  tableHeaderCell: { fontSize: 12, fontWeight: '800', color: THEME.primary },
  tableRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 10, borderBottomWidth: 1, borderBottomColor: '#E5E7E3', backgroundColor: '#FAFAF9' },
  tableCode: { fontSize: 13, fontWeight: '800', color: THEME.primary },
  tableSubName: { fontSize: 11, color: THEME.textMuted },
  tableCell: { fontSize: 13, fontWeight: '700', color: THEME.primary },
  gradeTapPill: { backgroundColor: THEME.primary, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  gradeTapText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  divider: { height: 1, backgroundColor: THEME.secondary, marginVertical: 12 },

  // Hourly Calendar Grid
  helperHint: { fontSize: 11, color: THEME.textMuted, marginTop: 6, marginBottom: 8 },
  hourRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 8 },
  hourLabel: { width: 52, fontSize: 12, fontWeight: '700', color: THEME.textMuted, paddingTop: 10 },
  emptySlotBtn: { borderWidth: 1, borderStyle: 'dashed', borderColor: THEME.secondary, borderRadius: 8, paddingVertical: 10, paddingHorizontal: 12, backgroundColor: '#FAFAF9' },
  emptySlotText: { fontSize: 12, color: THEME.textMuted, fontWeight: '500' },
  timelineBlock: { padding: 10, borderRadius: 8, marginBottom: 4 },
  timelineBlockTitle: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },
  timelineBlockSub: { color: '#E5E7EB', fontSize: 11, marginTop: 2 },

  primaryBtn: { backgroundColor: THEME.primary, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 8, alignItems: 'center' },
  primaryBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 13 },
  secondaryBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: THEME.secondary, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, marginTop: 10, alignSelf: 'flex-start' },
  secondaryBtnText: { color: THEME.primary, fontWeight: '700', fontSize: 12 },
  dayBar: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  dayPill: { paddingVertical: 8, paddingHorizontal: 10, borderRadius: 8, backgroundColor: THEME.secondary },
  dayPillActive: { backgroundColor: THEME.primary },
  dayText: { fontSize: 12, fontWeight: '600', color: THEME.primary },
  dayTextActive: { fontSize: 12, fontWeight: '700', color: '#FFFFFF' },
  subTabRow: { flexDirection: 'row', backgroundColor: THEME.secondary, borderRadius: 10, padding: 3, marginBottom: 12 },
  subTab: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 8 },
  subTabActive: { backgroundColor: THEME.primary },
  subTabText: { fontSize: 13, fontWeight: '600', color: THEME.primary },
  subTabTextActive: { fontSize: 13, fontWeight: '700', color: '#FFFFFF' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: 6 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: THEME.secondary, marginRight: 6 },
  chipActive: { backgroundColor: THEME.primary },
  chipText: { fontSize: 12, fontWeight: '600', color: THEME.primary },
  chipTextActive: { fontSize: 12, fontWeight: '700', color: '#FFFFFF' },
  noteBody: { fontSize: 14, color: THEME.textMuted, lineHeight: 20 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(35, 50, 74, 0.55)', justifyContent: 'center', padding: 16 },
  modalBox: { backgroundColor: THEME.surface, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: THEME.secondary },
  modalTitle: { fontSize: 18, fontWeight: '800', marginBottom: 12, color: THEME.primary },
  label: { fontSize: 13, fontWeight: '700', color: THEME.primary, marginBottom: 6 },
  input: { borderWidth: 1, borderColor: THEME.secondary, borderRadius: 8, padding: 10, marginBottom: 10, fontSize: 14, backgroundColor: THEME.background, color: THEME.primary },
});