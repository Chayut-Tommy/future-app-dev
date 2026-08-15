import React from 'react';
import { Pressable, Text } from 'react-native';
import { render, screen, userEvent } from '@testing-library/react-native';

// Infrastructure smoke test for Pass 2E Batch 2 (rendered-test foundation).
// Uses a local inline fixture only — no Navilo production component.
function SmokeFixture({ onPress }: { onPress: () => void }) {
  return (
    <Pressable role="button" aria-label="Smoke Button" onPress={onPress}>
      <Text>Smoke Button</Text>
    </Pressable>
  );
}

test('rntl foundation: render, query, press, and matcher all work', async () => {
  const onPress = jest.fn();
  const user = userEvent.setup();

  await render(<SmokeFixture onPress={onPress} />);

  const button = screen.getByRole('button', { name: 'Smoke Button' });
  expect(button).toBeOnTheScreen();

  await user.press(button);

  expect(onPress).toHaveBeenCalledTimes(1);
});
