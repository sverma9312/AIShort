import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { config } from '@/lib/config';
import { useTheme } from '@/lib/theme';

type FeedbackType = 'suggestion' | 'bug' | 'source' | 'query';

interface TypeConfig {
  id: FeedbackType;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  buttonLabel: string;
  subjectPlaceholder: string;
  messagePlaceholder: string;
  successTitle: string;
  successMessage: string;
}

const FEEDBACK_CONFIGS: Record<FeedbackType, TypeConfig> = {
  suggestion: {
    id: 'suggestion',
    label: 'Suggestion',
    icon: 'bulb-outline',
    buttonLabel: 'Submit Suggestion',
    subjectPlaceholder: 'e.g. Add dark mode toggle or new category',
    messagePlaceholder: 'Describe what you would like to see added or improved in AIShort...',
    successTitle: 'Suggestion Received!',
    successMessage:
      'Thank you for your suggestion! Ideas like yours help shape future updates of AIShort. Your idea was sent directly to our team at ',
  },
  bug: {
    id: 'bug',
    label: 'Bug Report',
    icon: 'bug-outline',
    buttonLabel: 'Report Bug',
    subjectPlaceholder: 'e.g. Story image failed to load',
    messagePlaceholder: 'Describe what happened, what you expected, and any steps to reproduce...',
    successTitle: 'Bug Report Received!',
    successMessage:
      'Thank you for reporting this issue. We will investigate and work on a fix. Your report was sent directly to our team at ',
  },
  source: {
    id: 'source',
    label: 'New Source',
    icon: 'newspaper-outline',
    buttonLabel: 'Suggest Source',
    subjectPlaceholder: 'e.g. Add MIT Technology Review AI',
    messagePlaceholder: 'Provide the website name, publication URL, or RSS feed link...',
    successTitle: 'Source Suggestion Received!',
    successMessage:
      'Thank you for suggesting a new source! We review all suggested publications and feeds for addition to our pipeline. Sent directly to our team at ',
  },
  query: {
    id: 'query',
    label: 'Question',
    icon: 'help-circle-outline',
    buttonLabel: 'Submit Question',
    subjectPlaceholder: 'e.g. Question about story updates or privacy',
    messagePlaceholder: 'Ask your question here and we will get back to you...',
    successTitle: 'Question Received!',
    successMessage:
      'Thank you for reaching out! We have received your question and will get back to you as soon as possible. Sent directly to our team at ',
  },
};

const FEEDBACK_TYPES: TypeConfig[] = Object.values(FEEDBACK_CONFIGS);

interface FeedbackModalProps {
  visible: boolean;
  onClose: () => void;
}

export function FeedbackModal({ visible, onClose }: FeedbackModalProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  const [type, setType] = useState<FeedbackType>('suggestion');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const currentConfig = FEEDBACK_CONFIGS[type];

  const resetForm = () => {
    setType('suggestion');
    setSubject('');
    setMessage('');
    setUserEmail('');
    setSubmitting(false);
    setSubmitted(false);
    setErrorMessage(null);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleSubmit = async () => {
    const trimmedSubject = subject.trim();
    const trimmedMessage = message.trim();

    if (!trimmedSubject) {
      Alert.alert('Subject required', 'Please enter a short subject for your message.');
      return;
    }
    if (!trimmedMessage) {
      Alert.alert('Message required', 'Please enter your message or query.');
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);

    const typeLabel = currentConfig.label;
    const appVersion = Constants.expoConfig?.version ?? '1.0.0';
    const platformInfo = `${Platform.OS} ${Platform.Version}`;

    try {
      const response = await fetch(config.supportFormEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Origin: 'https://sverma9312.github.io',
          Referer: 'https://sverma9312.github.io/AIShort/',
        },
        body: JSON.stringify({
          _subject: `[AIShort ${typeLabel}] ${trimmedSubject}`,
          category: typeLabel,
          subject: trimmedSubject,
          message: trimmedMessage,
          reply_to: userEmail.trim() || undefined,
          app_version: appVersion,
          device: platformInfo,
        }),
      });

      interface FormSubmitResult {
        success?: boolean | string;
        message?: string;
      }
      const data: FormSubmitResult | null = (await response
        .json()
        .catch(() => null)) as FormSubmitResult | null;

      if (response.ok && (data?.success === 'true' || data?.success === true)) {
        setSubmitted(true);
      } else if (data && data.success === 'false' && typeof data.message === 'string') {
        // If form needs activation or specific error
        setErrorMessage(data.message);
      } else if (response.ok) {
        // Fallback for endpoints returning 200 without success boolean
        setSubmitted(true);
      } else {
        const detail: string =
          typeof data?.message === 'string'
            ? data.message
            : 'Please check your connection or email us directly.';
        setErrorMessage(detail);
      }
    } catch {
      setErrorMessage(
        'Unable to send. Please check your internet connection or email us directly.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  const openMailFallback = () => {
    const mailto = `mailto:${config.supportEmail}?subject=${encodeURIComponent(
      `[AIShort ${currentConfig.label}] ${subject.trim()}`,
    )}&body=${encodeURIComponent(
      `${message.trim()}\n\n---\nApp: AIShort ${Constants.expoConfig?.version ?? '1.0.0'}\nOS: ${Platform.OS} ${Platform.Version}`,
    )}`;
    Linking.openURL(mailto).catch(() => {
      Alert.alert('Email address', `You can reach us at: ${config.supportEmail}`);
    });
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={[styles.container, { backgroundColor: theme.background }]}
      >
        {/* Header */}
        <View
          style={[
            styles.header,
            {
              borderBottomColor: theme.border,
              paddingTop: Math.max(insets.top, 16),
            },
          ]}
        >
          <View style={styles.headerTitleRow}>
            <Ionicons name="chatbubble-ellipses-outline" size={22} color={theme.accent} />
            <Text style={[styles.headerTitle, { color: theme.text }]}>Support & Feedback</Text>
          </View>
          <Pressable
            onPress={handleClose}
            hitSlop={12}
            style={styles.closeButton}
            accessibilityRole="button"
            accessibilityLabel="Close feedback form"
          >
            <Ionicons name="close" size={24} color={theme.muted} />
          </Pressable>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: Math.max(insets.bottom, 24) + 16 },
          ]}
          keyboardShouldPersistTaps="handled"
        >
          {submitted ? (
            <View style={styles.successContainer}>
              <View style={[styles.successIconBubble, { backgroundColor: `${theme.accent}18` }]}>
                <Ionicons name="checkmark-circle" size={56} color={theme.accent} />
              </View>
              <Text style={[styles.successTitle, { color: theme.text }]}>
                {currentConfig.successTitle}
              </Text>
              <Text style={[styles.successMessage, { color: theme.muted }]}>
                {currentConfig.successMessage}
                <Text style={{ color: theme.accent, fontWeight: '600' }}>
                  {config.supportEmail}
                </Text>
                .
              </Text>
              <Pressable
                onPress={handleClose}
                style={[styles.doneButton, { backgroundColor: theme.accent }]}
                accessibilityRole="button"
                accessibilityLabel="Done"
              >
                <Text style={[styles.doneButtonText, { color: theme.accentText }]}>Done</Text>
              </Pressable>
            </View>
          ) : (
            <>
              {/* Type selector chips */}
              <Text style={[styles.fieldLabel, { color: theme.muted }]}>WHAT IS THIS ABOUT?</Text>
              <View style={styles.chipRow}>
                {FEEDBACK_TYPES.map((t) => {
                  const active = type === t.id;
                  return (
                    <Pressable
                      key={t.id}
                      onPress={() => setType(t.id)}
                      style={[
                        styles.chip,
                        {
                          backgroundColor: active ? theme.accent : theme.chip,
                          borderColor: active ? theme.accent : theme.border,
                        },
                      ]}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                    >
                      <Ionicons
                        name={t.icon}
                        size={15}
                        color={active ? theme.accentText : theme.text}
                        style={{ marginRight: 6 }}
                      />
                      <Text
                        style={[styles.chipText, { color: active ? theme.accentText : theme.text }]}
                      >
                        {t.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              {/* Subject Input */}
              <Text style={[styles.fieldLabel, { color: theme.muted }]}>SUBJECT *</Text>
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: theme.card,
                    borderColor: theme.border,
                    color: theme.text,
                  },
                ]}
                placeholder={currentConfig.subjectPlaceholder}
                placeholderTextColor={theme.muted}
                value={subject}
                onChangeText={setSubject}
                returnKeyType="next"
              />

              {/* Message Input */}
              <Text style={[styles.fieldLabel, { color: theme.muted }]}>MESSAGE *</Text>
              <TextInput
                style={[
                  styles.input,
                  styles.textArea,
                  {
                    backgroundColor: theme.card,
                    borderColor: theme.border,
                    color: theme.text,
                  },
                ]}
                placeholder={currentConfig.messagePlaceholder}
                placeholderTextColor={theme.muted}
                value={message}
                onChangeText={setMessage}
                multiline
                numberOfLines={5}
                textAlignVertical="top"
              />

              {/* Optional Email Input for reply */}
              <Text style={[styles.fieldLabel, { color: theme.muted }]}>
                YOUR EMAIL (OPTIONAL, FOR REPLIES)
              </Text>
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: theme.card,
                    borderColor: theme.border,
                    color: theme.text,
                  },
                ]}
                placeholder="you@example.com"
                placeholderTextColor={theme.muted}
                value={userEmail}
                onChangeText={setUserEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />

              {/* Error Banner if sending fails */}
              {errorMessage ? (
                <View style={[styles.errorBanner, { backgroundColor: '#fee2e2' }]}>
                  <Ionicons name="alert-circle" size={18} color="#dc2626" />
                  <Text style={styles.errorText}>{errorMessage}</Text>
                  <Pressable onPress={openMailFallback} style={styles.mailFallbackButton}>
                    <Text style={styles.mailFallbackText}>Open in Mail app instead</Text>
                  </Pressable>
                </View>
              ) : null}

              {/* Dynamic Submit button */}
              <Pressable
                onPress={handleSubmit}
                disabled={submitting}
                style={[
                  styles.submitButton,
                  { backgroundColor: theme.accent, opacity: submitting ? 0.7 : 1 },
                ]}
                accessibilityRole="button"
                accessibilityLabel={currentConfig.buttonLabel}
              >
                {submitting ? (
                  <ActivityIndicator color={theme.accentText} />
                ) : (
                  <>
                    <Ionicons
                      name={currentConfig.icon}
                      size={18}
                      color={theme.accentText}
                      style={{ marginRight: 8 }}
                    />
                    <Text style={[styles.submitButtonText, { color: theme.accentText }]}>
                      {currentConfig.buttonLabel}
                    </Text>
                  </>
                )}
              </Pressable>

              {/* Footnotes & GitHub alternative */}
              <View style={styles.footerLinks}>
                <Text style={[styles.footerInfo, { color: theme.muted }]}>
                  Sends directly to {config.supportEmail}.
                </Text>
                <Pressable
                  onPress={() => Linking.openURL('https://github.com/sverma9312/AIShort/issues')}
                  style={styles.githubLink}
                >
                  <Ionicons name="logo-github" size={15} color={theme.muted} />
                  <Text style={[styles.githubLinkText, { color: theme.muted }]}>
                    Prefer GitHub? Open an issue
                  </Text>
                </Pressable>
              </View>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  closeButton: {
    padding: 4,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    gap: 12,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginTop: 6,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 4,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
    borderWidth: 1,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  textArea: {
    height: 120,
    paddingTop: 12,
  },
  errorBanner: {
    padding: 12,
    borderRadius: 8,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  errorText: {
    color: '#991b1b',
    fontSize: 13,
    flex: 1,
  },
  mailFallbackButton: {
    width: '100%',
    paddingTop: 4,
  },
  mailFallbackText: {
    color: '#b91c1c',
    fontWeight: '600',
    fontSize: 13,
    textDecorationLine: 'underline',
  },
  submitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 10,
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  footerLinks: {
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
  },
  footerInfo: {
    fontSize: 12,
  },
  githubLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
  },
  githubLinkText: {
    fontSize: 12,
    textDecorationLine: 'underline',
  },
  successContainer: {
    alignItems: 'center',
    paddingVertical: 40,
    paddingHorizontal: 20,
    gap: 16,
  },
  successIconBubble: {
    width: 92,
    height: 92,
    borderRadius: 46,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  successTitle: {
    fontSize: 22,
    fontWeight: '700',
  },
  successMessage: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    maxWidth: 320,
    marginBottom: 16,
  },
  doneButton: {
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
  },
  doneButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
});
