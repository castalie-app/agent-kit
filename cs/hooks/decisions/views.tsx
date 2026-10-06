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
  ANSWER_HEADING,
  ANSWER_KEYS,
  BACK_TEXT,
  CHOOSE_TEXT,
  DISARM_TEXT,
  SEND_TEXT,
  SENDING_TEXT,
  CARDS_PANE_TITLE,
  IN_CASTALIE_TEXT,
  OPEN_TEXT,
  RECOMMENDED_MARK,
  REFRESH_TEXT,
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
  /** The sheet as markdown, or the line that says why it is not here yet. */
  text: string
  isLoading: boolean
  /** What the last answer left to say — « ✓ Réponse enregistrée sur n° 77. 2 à répondre. » */
  notice?: string | null
}

/** What `answerBarOf` answers: the bar under a pending sheet. */
export type AnswerBarView = {
  error: string | null
  isSending: boolean
  options: { id: number; title: string; label: string; hotkey: string | undefined; isRecommended: boolean; isArmed: boolean }[]
  armed: { id: number; title: string; needsReason: boolean; hint: string; confirm: string } | null
  field: { label: string; placeholder: string; value: string; submitLabel: string } | null
  effects: { label: string; value: string; options: { value: string; label: string }[] } | null
  canSendText: boolean
  fallback: string | null
}

export type AnswerHandlers = {
  /** A digit, or a press on the option's own title: marks it, answers nothing. */
  arm: (optionId: number) => void
  /** « Choisir »: answers with that option at once. */
  choose: (optionId: number) => void
  /** « Répondre « … » », the marked option's Enter. */
  confirm: () => void
  disarm: () => void
  /** Every change of the field: the draft keeps it across redraws. */
  type: (text: string) => void
  /** Enter in the field, or « Répondre avec ce texte ». */
  send: (text?: string) => void
  effect: (value: string) => void
}

/**
 * The bar under a pending sheet, as Castalie's own: a row per option — its title, which a digit
 * marks, and « Choisir », which answers — then the marked option's « Répondre », the field to
 * answer otherwise or adjust, and the effect a written answer has.
 */
function answerBar(kit: Kit, bar: AnswerBarView, on: AnswerHandlers): RenderElement {
  const { Box, Text, Button, Input, Select } = kit

  return (
    <Box key="answer" flexDirection="column" marginTop={1} borderStyle="round" borderDimColor paddingX={1}>
      <Text key="heading" bold>
        {ANSWER_HEADING}
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
      {bar.options.map(option => (
        <Box key={`row-${option.id}`} flexDirection="row" justifyContent="space-between">
          <Button
            key={ANSWER_KEYS.option(option.id)}
            plain
            hotkey={option.hotkey}
            dimColor={!option.isArmed}
            label={option.isArmed ? `› ${option.label}` : option.label}
            onPress={() => on.arm(option.id)}
          />
          <Button
            key={ANSWER_KEYS.choose(option.id)}
            variant={option.isRecommended ? 'primary' : 'secondary'}
            label={CHOOSE_TEXT}
            onPress={() => on.choose(option.id)}
          />
        </Box>
      ))}
      {bar.armed === null ? null : (
        <Box key="armed" flexDirection="column">
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
      {bar.field === null || Input === undefined ? null : (
        <Input
          key={ANSWER_KEYS.text}
          label={bar.field.label}
          placeholder={bar.field.placeholder}
          value={bar.field.value}
          submitLabel={bar.field.submitLabel}
          onInput={value => on.type(value)}
          onSubmit={value => on.send(value)}
        />
      )}
      {bar.effects === null || Select === undefined ? null : (
        <Select
          key={ANSWER_KEYS.effect}
          label={bar.effects.label}
          options={bar.effects.options}
          value={bar.effects.value}
          onSelect={value => on.effect(value)}
        />
      )}
      {bar.canSendText && Input !== undefined ? (
        <Button key={ANSWER_KEYS.send} variant="secondary" label={SEND_TEXT} onPress={() => on.send()} />
      ) : null}
      {bar.fallback === null ? null : (
        <Box key="fallback">
          <Text dimColor wrap="wrap">
            {bar.fallback}
          </Text>
        </Box>
      )}
    </Box>
  )
}

/**
 * The pane one card opens into: a way back, the decision's own page, the whole sheet, and — while
 * it waits — the bar that answers it.
 *
 * @param kit the elements `$.ui.resolve(e)` handed out
 * @param sheet what the pane holds
 * @param back what « ← cartes » runs: the sheet closes, the cards stay
 * @param answer the bar and what it runs; absent while the sheet loads or once nothing waits
 */
export function sheetView(
  kit: Kit,
  sheet: SheetView,
  back: () => void,
  answer?: { bar: AnswerBarView; on: AnswerHandlers } | null,
): RenderElement {
  const { Box, Text, Button, Link } = kit

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
        {sheet.isLoading ? (
          <Text key="loading" dimColor wrap="wrap">
            {sheet.text}
          </Text>
        ) : (
          markdownOf(kit, `sheet-${sheet.id}`, sheet.text)
        )}
      </Box>
      {answer === null || answer === undefined || sheet.isLoading ? null : answerBar(kit, answer.bar, answer.on)}
    </Box>
  )
}
