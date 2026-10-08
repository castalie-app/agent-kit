/* @jsxRuntime classic */
/* @jsx h */
/* @jsxFrag Fragment */
// The decisions panel's trees of elements — and nothing else.
//
// Every decision about what is drawn lives in `render.mjs`, which answers plain data; this file
// turns a card into a framed box and a sheet into one `Markdown`. That boundary is what lets the
// whole appearance be checked in node.

import type { ElementConstructor, RenderElement } from 'claude-code'

import type { BoxProps, ButtonProps, InputProps, LinkProps, MarkdownProps, SelectProps, TextProps } from 'claude-code'

import { cardMarkdown } from './render.mjs'
import {
  ALL_IN_CASTALIE_TEXT,
  ANSWER_KEYS,
  BACK_TEXT,
  CHOOSE_TEXT,
  DESCRIPTION_HEADING,
  DISARM_TEXT,
  SENDING_TEXT,
  CARDS_PANE_TITLE,
  IN_CASTALIE_TEXT,
  OPEN_TEXT,
  OPTIONS_HEADING,
  OTHER_TITLE,
  RECOMMENDED_MARK,
  REFRESH_TEXT,
  SHEET_KEYS,
} from './names.mjs'

/**
 * The elements a surface hands out. `Markdown` is optional: every surface of this build draws
 * it, an older engine does not, and a tree naming an element the surface lacks is refused whole
 * — the pane would close. Where it is missing, the same text is drawn as wrapped `Text`.
 */
export type Kit = {
  Box: ElementConstructor<BoxProps>
  Text: ElementConstructor<TextProps>
  Button: ElementConstructor<ButtonProps>
  Link: ElementConstructor<LinkProps>
  Markdown?: ElementConstructor<MarkdownProps>
  /** Every surface but mobile: where it is missing, the bar keeps its options and drops the field. */
  Input?: ElementConstructor<InputProps>
  Select?: ElementConstructor<SelectProps>
}

export type CardView = {
  key: string
  id: number
  server: string
  hotkey: string | undefined
  title: string
  url: string | null
  meta: string
  recommended: string | null
  isUnopened: boolean
}

export type PanelView = {
  notice: string | null
  objective: { text: string; url: string | null; caveat: string | null } | null
  workspaces: {
    key: string
    label: string | null
    summary: string | null
    pageUrl: string | null
    notice: string | null
    groups: { key: string; label: string; isAgent: boolean; count: number; cards: CardView[] }[]
    more: number
  }[]
}

export type CardsHandlers = {
  open: (card: CardView) => void
  refresh: () => void
}

/** Model-style text, or the same text wrapped where the surface draws no `Markdown`. */
function markdownOf(kit: Kit, key: string, text: string, onLink?: { hrefs: string[]; press: () => void }) {
  const { Text, Markdown } = kit
  if (Markdown === undefined) return <Text key={key} wrap="wrap">{text}</Text>
  if (onLink === undefined) return <Markdown key={key} text={text} />

  return (
    <Markdown key={key} text={text} pressableLinks={onLink.hrefs} onLinkPress={() => onLink.press()} />
  )
}

/**
 * The cards pane: the inbox's figures, then a group per agent, then a framed card per decision.
 *
 * A card opens whole three ways, whichever the surface offers: a press anywhere on its text (every
 * line is a link the pane takes over where the surface reports clicks), its « voir en grand »
 * button, and the digit that button carries while the pane holds the keyboard.
 *
 * @param kit the elements `$.ui.resolve(e)` handed out
 * @param panel what `cardsOf` answered
 * @param on what a card and the refresh run
 */
export function cardsView(kit: Kit, panel: PanelView, on: CardsHandlers): RenderElement {
  const { Box, Text, Button, Link } = kit

  // The whole card is one markdown block whose every line links to the decision: a press anywhere
  // on its text opens the sheet, and the frame lights under the pointer, so the card reads as one
  // control. Where the surface draws no `Markdown`, the same lines are text and the button opens.
  const card = (view: CardView) => {
    const body =
      kit.Markdown === undefined
        ? [
            <Text key={`title-${view.key}`} bold wrap="wrap">
              {view.title}
            </Text>,
            view.meta === '' ? null : (
              <Text key={`meta-${view.key}`} dimColor wrap="wrap">
                {view.meta}
              </Text>
            ),
            view.recommended === null ? null : (
              <Text key={`rec-${view.key}`} wrap="wrap">
                {`${RECOMMENDED_MARK} ${view.recommended}`}
              </Text>
            ),
          ]
        : view.url === null
          ? markdownOf(kit, `card-${view.key}`, cardMarkdown(view))
          : markdownOf(kit, `card-${view.key}`, cardMarkdown(view), {
              hrefs: [view.url],
              press: () => on.open(view),
            })

    return (
      <Box
        key={view.key}
        flexDirection="column"
        borderStyle="round"
        borderDimColor
        paddingX={1}
        hover={{ borderColor: 'blue', borderDimColor: false }}
      >
        {body}
        <Button
          key={`open-${view.key}`}
          plain
          dimColor
          hotkey={view.hotkey}
          label={OPEN_TEXT}
          onPress={() => on.open(view)}
        />
      </Box>
    )
  }

  return (
    <Box flexDirection="column">
      <Box key="head" flexDirection="row" justifyContent="space-between">
        <Text bold>{CARDS_PANE_TITLE}</Text>
        <Button key="refresh" plain dimColor hotkey="r" label={REFRESH_TEXT} onPress={() => on.refresh()} />
      </Box>
      {panel.objective === null ? null : (
        <Box key="objective" flexDirection="column">
          {panel.objective.url === null ? (
            <Text key="name" bold wrap="wrap">
              {panel.objective.text}
            </Text>
          ) : (
            <Link key="name" href={panel.objective.url}>
              <Text bold wrap="wrap">
                {panel.objective.text}
              </Text>
            </Link>
          )}
          {panel.objective.caveat === null ? null : (
            <Text key="caveat" dimColor italic wrap="wrap">
              {panel.objective.caveat}
            </Text>
          )}
        </Box>
      )}
      {panel.notice === null ? null : (
        <Text key="notice" dimColor wrap="wrap">
          {panel.notice}
        </Text>
      )}
      {panel.workspaces.map(workspace => (
        <Box key={`ws-${workspace.key}`} flexDirection="column">
          {workspace.label === null ? null : (
            <Text key="label" bold color="blue">
              {workspace.label}
            </Text>
          )}
          {workspace.summary === null ? null : (
            <Text key="summary" dimColor wrap="wrap">
              {workspace.summary}
            </Text>
          )}
          {workspace.notice === null ? null : (
            <Text key="notice" dimColor wrap="wrap">
              {workspace.notice}
            </Text>
          )}
          {workspace.groups.map(group => (
            <Box key={`group-${group.key}`} flexDirection="column" marginTop={1}>
              <Text key="head" wrap="truncate-end">
                <Text bold>{group.label}</Text>
                <Text dimColor>{` · ${group.count}`}</Text>
              </Text>
              {group.cards.map(card)}
            </Box>
          ))}
          {workspace.more > 0 ? (
            <Text key="more" dimColor>{`… et ${workspace.more} de plus`}</Text>
          ) : null}
          {workspace.pageUrl === null ? null : (
            <Box key="page" marginTop={1}>
              <Link href={workspace.pageUrl}>
                <Text dimColor>{ALL_IN_CASTALIE_TEXT}</Text>
              </Link>
            </Box>
          )}
        </Box>
      ))}
    </Box>
  )
}

export type SheetView = {
  id: number
  url: string | null
  /** While it loads, or once gone: the line that says why the sheet is not here yet. */
  text: string
  isLoading: boolean
  /** What the last answer left to say — « ✓ Réponse enregistrée sur n° 77. 2 à répondre. » */
  notice?: string | null
  /** The question and the line of who asks, since when, by when. */
  head?: string
  /** The depths of the description (Castalie spec 88): a button each, the one shown marked. */
  levels?: { words: number; label: string; isActive: boolean }[]
  /** The description at the depth shown. */
  description?: string | null
  /** A sheet that no longer waits: its cards as text, the readers' questions and the answer. */
  settled?: { cards: string[]; asks: string | null; answer: string | null } | null
}

/** What `answerBarOf` answers: the cards of a pending sheet, then « Autre réponse ou question ». */
export type AnswerBarView = {
  error: string | null
  isSending: boolean
  cards: { id: number; title: string; href: string | null; markdown: string; hotkey: string | undefined; isRecommended: boolean; isArmed: boolean }[]
  armed: { id: number; title: string; needsReason: boolean; hint: string; confirm: string } | null
  other: {
    title: string
    asks: string | null
    field: { label: string; placeholder: string; value: string; submitLabel: string } | null
    answerLabel: string
    askLabel: string
    canAnswer: boolean
    canAsk: boolean
  }
  fallback: string | null
}

export type AnswerHandlers = {
  /** A digit: marks the card, answers nothing. */
  arm: (optionId: number) => void
  /** A press on the card: answers with that option at once. */
  choose: (optionId: number) => void
  /** « Répondre « … » », the marked card's Enter. */
  confirm: () => void
  disarm: () => void
  /** Every change of the field: the draft keeps it across redraws. */
  type: (text: string) => void
  /** Enter in the field, or « Répondre »: the words are the answer. */
  send: (text?: string) => void
  /** « Poser la question »: the words go to the agent that asked, as a question. */
  ask: () => void
}

/** A framed card, as the cards pane draws its own. */
function framed(kit: Kit, key: string, children: (RenderElement | null)[], isRecommended = false): RenderElement {
  const { Box } = kit
  return (
    <Box
      key={key}
      flexDirection="column"
      marginTop={1}
      borderStyle="round"
      borderDimColor={!isRecommended}
      borderColor={isRecommended ? 'green' : undefined}
      paddingX={1}
      hover={{ borderColor: 'blue', borderDimColor: false }}
    >
      {children}
    </Box>
  )
}

/**
 * The cards of a pending sheet, as Castalie's own (spec 88): a framed card per option, whose
 * every line is a press that answers with it, and its digit, which only marks it; then the marked
 * card's « Répondre », and the last card, « Autre réponse ou question : », with its field,
 * « Répondre » and « Poser la question ».
 */
function answerCards(kit: Kit, bar: AnswerBarView, on: AnswerHandlers): RenderElement {
  const { Box, Text, Button, Input } = kit

  return (
    <Box key="answer" flexDirection="column" marginTop={1}>
      <Text key="heading" bold>
        {OPTIONS_HEADING}
      </Text>
      {bar.error === null ? null : (
        <Box key="error">
          <Text color="red" wrap="wrap">
            {bar.error}
          </Text>
        </Box>
      )}
      {bar.isSending ? (
        <Box key="sending">
          <Text dimColor wrap="wrap">
            {SENDING_TEXT}
          </Text>
        </Box>
      ) : null}
      {bar.cards.map(card =>
        framed(
          kit,
          SHEET_KEYS.card(card.id),
          [
            card.href === null
              ? markdownOf(kit, `text-${card.id}`, card.markdown)
              : markdownOf(kit, `text-${card.id}`, card.markdown, { hrefs: [card.href], press: () => on.choose(card.id) }),
            // Its digit, or a press on « Choisir », only marks it: Enter on « Répondre « … » » answers.
            <Button
              key={ANSWER_KEYS.option(card.id)}
              plain
              hotkey={card.hotkey}
              dimColor={!card.isArmed}
              label={card.isArmed ? `› ${CHOOSE_TEXT}` : CHOOSE_TEXT}
              onPress={() => on.arm(card.id)}
            />,
          ],
          card.isRecommended,
        ),
      )}
      {bar.armed === null ? null : (
        <Box key="armed" flexDirection="column" marginTop={1}>
          <Box key="hint">
            <Text dimColor wrap="wrap">
              {bar.armed.hint}
            </Text>
          </Box>
          <Box key="armed-actions" flexDirection="row">
            <Button key={ANSWER_KEYS.confirm} variant="primary" label={bar.armed.confirm} onPress={() => on.confirm()} />
            <Button key={ANSWER_KEYS.disarm} plain dimColor label={DISARM_TEXT} onPress={() => on.disarm()} />
          </Box>
        </Box>
      )}
      {framed(kit, 'other', [
        <Text key="title" bold>
          {bar.other.title}
        </Text>,
        bar.other.asks === null ? null : markdownOf(kit, 'asks', bar.other.asks),
        bar.other.field === null || Input === undefined ? null : (
          <Input
            key={ANSWER_KEYS.text}
            label={bar.other.field.label}
            placeholder={bar.other.field.placeholder}
            value={bar.other.field.value}
            submitLabel={bar.other.field.submitLabel}
            onInput={value => on.type(value)}
            onSubmit={value => on.send(value)}
          />
        ),
        bar.other.canAnswer || bar.other.canAsk ? (
          <Box key="other-actions" flexDirection="row">
            {bar.other.canAnswer ? (
              <Button key={ANSWER_KEYS.send} variant="primary" label={bar.other.answerLabel} onPress={() => on.send()} />
            ) : null}
            {bar.other.canAsk ? (
              <Button key={SHEET_KEYS.ask} variant="secondary" label={bar.other.askLabel} onPress={() => on.ask()} />
            ) : null}
          </Box>
        ) : null,
        bar.fallback === null ? null : (
          <Text key="fallback" dimColor wrap="wrap">
            {bar.fallback}
          </Text>
        ),
      ])}
    </Box>
  )
}

/**
 * The pane one card opens into: a way back, the decision's own page, the question, the
 * description with its three depths, and the cards — which answer while it waits.
 *
 * @param kit the elements `$.ui.resolve(e)` handed out
 * @param sheet what the pane holds
 * @param back what « ← cartes » runs: the sheet closes, the cards stay
 * @param answer the cards and what they run; absent while the sheet loads or once nothing waits
 * @param level what a depth's button runs
 */
export function sheetView(
  kit: Kit,
  sheet: SheetView,
  back: () => void,
  answer?: { bar: AnswerBarView; on: AnswerHandlers } | null,
  level?: (words: number) => void,
): RenderElement {
  const { Box, Text, Button, Link } = kit
  const levels = sheet.levels ?? []

  return (
    <Box flexDirection="column">
      <Box key="head" flexDirection="row" justifyContent="space-between">
        <Button key="back" plain dimColor role="dismiss" label={BACK_TEXT} onPress={() => back()} />
        {sheet.url === null ? null : (
          <Link key="page" href={sheet.url}>
            <Text dimColor>{IN_CASTALIE_TEXT}</Text>
          </Link>
        )}
      </Box>
      {sheet.notice === null || sheet.notice === undefined ? null : (
        <Box key="answered">
          <Text color="green" wrap="wrap">
            {sheet.notice}
          </Text>
        </Box>
      )}
      <Box key="body" flexDirection="column" marginTop={1}>
        {sheet.isLoading || sheet.head === undefined ? (
          <Text key="loading" dimColor wrap="wrap">
            {sheet.text}
          </Text>
        ) : (
          markdownOf(kit, `sheet-${sheet.id}`, sheet.head)
        )}
      </Box>
      {sheet.isLoading || sheet.description === undefined || sheet.description === null ? null : (
        <Box key="description" flexDirection="column" marginTop={1}>
          <Box key="levels" flexDirection="row">
            <Text key="heading" bold>
              {`${DESCRIPTION_HEADING}  `}
            </Text>
            {levels.length < 2
              ? null
              : levels.map(item => (
                  <Button
                    key={SHEET_KEYS.level(item.words)}
                    plain
                    dimColor={!item.isActive}
                    label={item.isActive ? `[${item.label}]` : item.label}
                    onPress={() => level?.(item.words)}
                  />
                ))}
          </Box>
          {markdownOf(kit, `description-${sheet.id}`, sheet.description)}
        </Box>
      )}
      {sheet.isLoading || sheet.settled === null || sheet.settled === undefined ? null : (
        <Box key="settled" flexDirection="column" marginTop={1}>
          <Text key="heading" bold>
            {OPTIONS_HEADING}
          </Text>
          {sheet.settled.cards.map((text, index) => framed(kit, `settled-${index}`, [markdownOf(kit, `settled-text-${index}`, text)]))}
          {sheet.settled.asks === null
            ? null
            : framed(kit, 'settled-other', [
                <Text key="title" bold>
                  {OTHER_TITLE}
                </Text>,
                markdownOf(kit, 'settled-asks', sheet.settled.asks),
              ])}
          {sheet.settled.answer === null ? null : (
            <Box key="settled-answer" marginTop={1}>
              {markdownOf(kit, 'settled-answer-text', sheet.settled.answer)}
            </Box>
          )}
        </Box>
      )}
      {answer === null || answer === undefined || sheet.isLoading ? null : answerCards(kit, answer.bar, answer.on)}
    </Box>
  )
}
