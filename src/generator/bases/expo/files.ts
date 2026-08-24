export const TSCONFIG = `{
  "extends": "expo/tsconfig.base",
  "compilerOptions": {
    "strict": true,
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["**/*.ts", "**/*.tsx", ".expo/types/**/*.ts", "expo-env.d.ts"]
}
`

export const HELLO_COMPONENT = `import { Text, View } from 'react-native'

export function Hello() {
  return (
    <View>
      <Text>It works</Text>
    </View>
  )
}
`

export function appJson(name: string): string {
  return `${JSON.stringify(
    {
      expo: {
        name,
        slug: name,
        scheme: name,
        version: '1.0.0',
        orientation: 'portrait',
        userInterfaceStyle: 'automatic',
        newArchEnabled: true,
        web: { bundler: 'metro', output: 'static' },
        plugins: ['expo-router'],
      },
    },
    null,
    2
  )}\n`
}
