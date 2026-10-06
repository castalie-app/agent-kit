/* @jsxRuntime classic */
/* @jsx h */
/* @jsxFrag Fragment */
// The decisions panel's trees of elements — and nothing else.
//
// Every decision about what is drawn lives in `render.mjs`, which answers plain data; this file
// turns a card into a framed box and a sheet into one `Markdown`. That boundary is what lets the
// whole appearance be checked in node.

import type { ElementConstructor, RenderElement } from 'claude-code'

import type { BoxProps, ButtonProps, LinkProps, MarkdownProps, TextProps } from 'claude-code'

import { cardTitleMarkdown } from './render.mjs'
import {
  ALL_IN_CASTALIE_TEXT,
  BACK_TEXT,
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
 * A card opens whole three ways, whichever the surface offers: its title (a link the pane takes
 * over where the surface reports clicks), its « voir en grand » button, and the digit that button
 * carries while the pane holds the keyboard.
 *
 * @param kit the elements `$.ui.resolve(e)` handed out
 * @param panel what `cardsOf` answered
 * @param on what a card and the refresh run
 */
export function cardsView(kit: Kit, panel: PanelView, on: CardsHandlers): RenderElement {
  const { Box, Text, Button, Link } = kit

  const card = (view: CardView) => {
    const title =
      view.url === null
        ? markdownOf(kit, `title-${view.key}`, cardTitleMarkdown(view))
        : markdownOf(kit, `title-${view.key}`, cardTitleMarkdown(view), {
            hrefs: [view.url],
            press: () => on.open(view),
          })

    return (
      <Box key={view.key} flexDirection="column" borderStyle="round" borderDimColor paddingX={1}>
        {title}
        {view.meta === '' ? null : (
          <Text key={`meta-${view.key}`} dimColor wrap="wrap">
            {view.meta}
          </Text>
        )}
        {view.recommended === null ? null : (
          <Text key={`rec-${view.key}`} wrap="wrap">
            {`${RECOMMENDED_MARK} ${view.recommended}`}
          </Text>
        )}
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
}

/**
 * The pane one card opens into: a way back, the decision's own page, and the whole sheet.
 *
 * @param kit the elements `$.ui.resolve(e)` handed out
 * @param sheet what the pane holds
 * @param back what « ← cartes » runs: the sheet closes, the cards stay
 */
export function sheetView(kit: Kit, sheet: SheetView, back: () => void): RenderElement {
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
      <Box key="body" flexDirection="column" marginTop={1}>
        {sheet.isLoading ? (
          <Text key="loading" dimColor wrap="wrap">
            {sheet.text}
          </Text>
        ) : (
          markdownOf(kit, `sheet-${sheet.id}`, sheet.text)
        )}
      </Box>
    </Box>
  )
}
