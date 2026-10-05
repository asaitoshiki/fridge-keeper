package com.asaitoshiki.fridgekeeper.domain

import com.asaitoshiki.fridgekeeper.domain.model.FoodCategory

/**
 * 商品名によく出る語からカテゴリを推す。
 * ここを AI に任せる必要はない。入力の手間を減らすのが目的で、外れても
 * その場で直せるし、外部へ何も送らずに済む。
 */
private val CATEGORY_HINTS: List<Pair<FoodCategory, List<String>>> = listOf(
    FoodCategory.DAIRY to listOf("牛乳", "ヨーグルト", "チーズ", "バター", "生クリーム", "ミルク"),
    FoodCategory.EGG to listOf("卵", "たまご", "タマゴ"),
    FoodCategory.MEAT_FISH to listOf(
        "肉", "鶏", "豚", "牛", "ひき", "魚", "さけ", "鮭", "まぐろ", "さば",
        "えび", "いか", "ベーコン", "ハム", "ソーセージ",
    ),
    FoodCategory.VEGETABLE to listOf(
        "にんじん", "人参", "キャベツ", "レタス", "玉ねぎ", "たまねぎ", "じゃがいも", "トマト",
        "きゅうり", "なす", "ピーマン", "ねぎ", "ほうれん草", "もやし", "だいこん", "大根",
        "ブロッコリー", "きのこ", "しめじ", "えのき",
    ),
    FoodCategory.FRUIT to listOf("りんご", "みかん", "バナナ", "いちご", "ぶどう", "もも", "なし", "キウイ", "レモン"),
    FoodCategory.FROZEN to listOf("冷凍"),
    FoodCategory.SEASONING to listOf(
        "しょうゆ", "醤油", "みそ", "味噌", "塩", "砂糖", "酢", "ソース",
        "ケチャップ", "マヨ", "油", "みりん", "だし",
    ),
    FoodCategory.DRINK to listOf("ジュース", "お茶", "水", "コーヒー", "ビール", "炭酸", "サイダー"),
    FoodCategory.PROCESSED to listOf(
        "豆腐", "納豆", "パン", "麺", "うどん", "そば", "パスタ", "かまぼこ", "ちくわ", "缶詰",
    ),
)

fun guessCategoryByName(name: String): FoodCategory =
    CATEGORY_HINTS.firstOrNull { (_, keys) -> keys.any { name.contains(it) } }?.first
        ?: FoodCategory.OTHER
