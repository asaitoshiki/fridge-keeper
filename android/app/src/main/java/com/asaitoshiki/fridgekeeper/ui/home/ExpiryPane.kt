package com.asaitoshiki.fridgekeeper.ui.home

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.asaitoshiki.fridgekeeper.data.local.entity.FoodItemEntity
import com.asaitoshiki.fridgekeeper.domain.model.ExpiryType
import com.asaitoshiki.fridgekeeper.domain.model.StorageLocation
import com.asaitoshiki.fridgekeeper.ui.jp
import com.asaitoshiki.fridgekeeper.ui.label
import com.asaitoshiki.fridgekeeper.ui.remainingLabel
import com.asaitoshiki.fridgekeeper.ui.theme.LocalIsDarkTheme
import com.asaitoshiki.fridgekeeper.ui.theme.urgencyBarColor
import com.asaitoshiki.fridgekeeper.ui.theme.urgencyTextColor

/** 期限の近い順に並べた一覧。横に引けばその場で減らせる */
@Composable
fun ExpiryPane(
    state: HomeUiState,
    actions: ItemActions,
    onSelectFilter: (StorageLocation?) -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Row(
            Modifier.horizontalScroll(rememberScrollState()),
            horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            FilterChip(
                selected = state.locationFilter == null,
                onClick = { onSelectFilter(null) },
                label = { Text("すべて ${state.totalCount}") },
            )
            StorageLocation.entries.forEach { location ->
                FilterChip(
                    selected = state.locationFilter == location,
                    onClick = { onSelectFilter(location) },
                    label = { Text("${location.label} ${state.countIn(location)}") },
                )
            }
        }

        ItemList(state, state.filteredByExpiry, actions, "ここには何もありません")

        Text(
            text = "右へ引いて「1つ食べた」、さらに深く引いて「食べきった」、左へ引いて「捨てた」。",
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

/** 食材1件に対してできること。画面ごとに同じ操作を揃えるためまとめて渡す */
data class ItemActions(
    val onOpen: (FoodItemEntity) -> Unit,
    val onEatOne: (FoodItemEntity) -> Unit,
    val onEatAll: (FoodItemEntity) -> Unit,
    val onDiscard: (FoodItemEntity) -> Unit,
)

@Composable
fun ItemList(
    state: HomeUiState,
    cards: List<ItemCard>,
    actions: ItemActions,
    emptyText: String,
) {
    Column(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .background(MaterialTheme.colorScheme.surface)
            .border(1.dp, MaterialTheme.colorScheme.outlineVariant, RoundedCornerShape(14.dp)),
    ) {
        if (cards.isEmpty()) {
            Text(
                text = emptyText,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(28.dp),
            )
        }
        cards.forEachIndexed { index, card ->
            if (index > 0) HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
            SwipeRow(
                onEatOne = { actions.onEatOne(card.item) },
                onEatAll = { actions.onEatAll(card.item) },
                onDiscard = { actions.onDiscard(card.item) },
            ) {
                ItemRow(state, card) { actions.onOpen(card.item) }
            }
        }
    }
}

@Composable
private fun ItemRow(state: HomeUiState, card: ItemCard, onOpen: () -> Unit) {
    val dark = LocalIsDarkTheme.current
    Row(
        Modifier
            .fillMaxWidth()
            .height(IntrinsicSize.Min)
            .clickable(onClick = onOpen),
    ) {
        Box(
            Modifier
                .width(4.dp)
                .fillMaxHeight()
                .background(urgencyBarColor(card.status.urgency, dark)),
        )
        Column(
            Modifier
                .weight(1f)
                .padding(start = 12.dp, top = 12.dp, bottom = 12.dp, end = 6.dp),
            verticalArrangement = Arrangement.spacedBy(3.dp),
        ) {
            Text(
                text = card.item.name + if (card.item.quantity > 1) "  ×${card.item.quantity}" else "",
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.Medium,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
            Row(
                horizontalArrangement = Arrangement.spacedBy(6.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = "${state.compartmentPath(card.item.compartmentId)}・${card.item.category.label}",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                if (card.status.estimated && card.status.date != null) EstimateBadge()
                if (card.item.expiryType == ExpiryType.USE_BY) UseByBadge()
            }
        }
        Column(
            Modifier.padding(end = 16.dp, top = 12.dp, bottom = 12.dp),
            horizontalAlignment = Alignment.End,
        ) {
            Text(
                text = card.status.remainingLabel(),
                style = MaterialTheme.typography.labelLarge,
                fontWeight = FontWeight.SemiBold,
                color = urgencyTextColor(card.status.urgency, dark),
            )
            Text(
                text = card.status.date?.jp() ?: "—",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}
