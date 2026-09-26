package com.asaitoshiki.fridgekeeper.ui.home

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.asaitoshiki.fridgekeeper.domain.expiry.ExpiryUrgency
import com.asaitoshiki.fridgekeeper.ui.shortRemainingLabel
import com.asaitoshiki.fridgekeeper.ui.theme.LocalIsDarkTheme
import com.asaitoshiki.fridgekeeper.ui.theme.urgencyBarColor
import com.asaitoshiki.fridgekeeper.ui.theme.urgencyTextColor

/**
 * 庫内に置かれた食材ひとつ。
 * 推定期限には必ず「目安」バッジを出す（仕様書8.2）。枠線の違いだけに頼らない。
 */
@Composable
fun ItemChip(card: ItemCard, modifier: Modifier = Modifier, lifted: Boolean = false) {
    val dark = LocalIsDarkTheme.current
    val bar = urgencyBarColor(card.status.urgency, dark)
    val days = urgencyTextColor(card.status.urgency, dark)

    Row(
        modifier = modifier
            .alpha(if (lifted) 0.3f else 1f)
            .clip(RoundedCornerShape(8.dp))
            .background(MaterialTheme.colorScheme.surface)
            .border(1.dp, MaterialTheme.colorScheme.outlineVariant, RoundedCornerShape(8.dp))
            .height(36.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        /* 左端の縦バーが緊急度。推定期限は彩度を落として確定情報と見分ける */
        Box(
            Modifier
                .width(4.dp)
                .fillMaxHeight()
                .alpha(if (card.status.estimated) 0.62f else 1f)
                .background(bar),
        )
        Text(
            text = card.item.name + if (card.item.quantity > 1) " ×${card.item.quantity}" else "",
            style = MaterialTheme.typography.bodySmall,
            fontWeight = FontWeight.Medium,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.defaultMinSize(minWidth = 0.dp),
        )
        if (card.status.estimated && card.status.date != null) {
            EstimateBadge()
        }
        Text(
            text = card.status.shortRemainingLabel(),
            style = MaterialTheme.typography.labelSmall,
            fontWeight = FontWeight.SemiBold,
            color = days,
            maxLines = 1,
            modifier = Modifier.padding(end = 9.dp),
        )
    }
}

@Composable
fun EstimateBadge() {
    Text(
        text = "目安",
        fontSize = 9.sp,
        lineHeight = 12.sp,
        fontWeight = FontWeight.Bold,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = Modifier
            .border(1.dp, MaterialTheme.colorScheme.outlineVariant, RoundedCornerShape(3.dp))
            .padding(horizontal = 3.dp),
    )
}

/** 消費期限は過ぎたら食べてはいけないため、賞味期限より強い表示にする（仕様書8.2） */
@Composable
fun UseByBadge() {
    val color = urgencyTextColor(ExpiryUrgency.CRITICAL, LocalIsDarkTheme.current)
    Text(
        text = "消費期限",
        fontSize = 9.sp,
        lineHeight = 12.sp,
        fontWeight = FontWeight.Bold,
        color = color,
        modifier = Modifier
            .border(1.dp, color, RoundedCornerShape(3.dp))
            .padding(horizontal = 3.dp),
    )
}
