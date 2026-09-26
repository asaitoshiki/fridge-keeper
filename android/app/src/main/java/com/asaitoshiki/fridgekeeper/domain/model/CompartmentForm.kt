package com.asaitoshiki.fridgekeeper.domain.model

/**
 * 段の見た目。庫内のどこに置くかという事実とは切り離してある。
 * 形をいくら変えても期限の目安は StorageLocation から引くので、計算は影響を受けない。
 */
enum class CompartmentForm {
    SHELF,
    DRAWER,
    POCKET,
}
