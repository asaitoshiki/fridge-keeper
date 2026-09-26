package com.asaitoshiki.fridgekeeper.ui.home

import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable

/** 取り消せない操作の前に挟む確認 */
data class ConfirmRequest(
    val title: String,
    val body: String,
    val onConfirm: () -> Unit,
)

@Composable
fun ConfirmDialog(
    request: ConfirmRequest,
    onDismiss: () -> Unit,
    onConfirm: () -> Unit,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(request.title) },
        text = { if (request.body.isNotEmpty()) Text(request.body) },
        confirmButton = { TextButton(onClick = onConfirm) { Text("削除する") } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("やめる") } },
    )
}

fun confirmDeleteCompartment(
    state: HomeUiState,
    compartmentId: String,
    action: () -> Unit,
): ConfirmRequest {
    val inside = state.byExpiry.count { it.item.compartmentId == compartmentId }
    return ConfirmRequest(
        title = "${state.compartmentPath(compartmentId)}を削除しますか",
        body = if (inside > 0) "中の${inside}件は「買ってきたもの」に戻ります。" else "",
        onConfirm = action,
    )
}

fun confirmDeleteUnit(
    state: HomeUiState,
    unitId: String,
    action: () -> Unit,
): ConfirmRequest {
    val unitView = state.units.find { it.unit.id == unitId }
    val ids = unitView?.compartments?.map { it.compartment.id }.orEmpty()
    val inside = state.byExpiry.count { it.item.compartmentId in ids }
    return ConfirmRequest(
        title = "${unitView?.unit?.name.orEmpty()}を丸ごと削除しますか",
        body = if (inside > 0) "中の${inside}件は「買ってきたもの」に戻ります。" else "",
        onConfirm = action,
    )
}
